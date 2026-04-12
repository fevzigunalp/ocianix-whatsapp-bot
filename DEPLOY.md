# DEPLOY.md — WhatsApp AI Platform

Production deploy runbook for **this** repo. Assumes a single Ubuntu/Debian host with Docker + Nginx + Certbot.

---

## 1. Required env vars

All of these go into `platform/.env`. Template: `.env.example`.

| Var | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://wabot:***@postgres:5432/wabot_platform` | Must point at the pgvector-enabled Postgres |
| `AUTH_SECRET` | `openssl rand -base64 32` | NextAuth JWT secret |
| `AUTH_URL` / `NEXTAUTH_URL` | `https://bot.ocianix.com` | **HTTPS** canonical URL |
| `REDIS_URL` | `redis://:***@redis:6379` | Password required in prod |
| `MINIO_ENDPOINT` / `_PORT` / `_ACCESS_KEY` / `_SECRET_KEY` / `_BUCKET` | `minio` / `9000` / ... | |
| `EVOLUTION_API_URL` | `http://127.0.0.1:8080` | App → Evolution (private, loopback only) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `wabot` / *** / `wabot_platform` | Consumed by `docker-compose.prod.yml` |
| `REDIS_PASSWORD` | *** | Enforced by prod compose |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | `wabot_minio` / *** | Enforced by prod compose |
| `N8N_USER` / `N8N_PASSWORD` / `N8N_PUBLIC_URL` | | Only if n8n is used |
| `EVOLUTION_API_KEY` | `***` | Must match Evolution's `AUTHENTICATION_API_KEY` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Required for AI replies |
| `OPENAI_API_KEY` | `sk-...` | Optional — enables vector retrieval |
| `NEXT_PUBLIC_APP_URL` | `https://bot.ocianix.com` | Used in UI and links |
| `PUBLIC_WEBHOOK_URL` | `https://bot.ocianix.com` | URL Evolution POSTs webhooks to; defaults to `NEXT_PUBLIC_APP_URL` |
| `NODE_ENV` | `production` | |
| `PORT` | `3001` | Port Next.js listens on |

---

## 2. Domains / subdomains

| Host | Purpose |
|---|---|
| `bot.ocianix.com` | The Next.js app (UI + API + `/api/webhook/evolution`) |
| `api.ocianix.com` | *(Optional)* If you want webhooks on a separate subdomain, set `PUBLIC_WEBHOOK_URL=https://api.ocianix.com` and proxy it to the same Next.js backend |
| `n8n.ocianix.com` | *(Optional)* n8n UI, basic-auth protected |
| `status.ocianix.com` | *(Optional)* Uptime Kuma |

All must have TLS. Evolution API, Postgres, Redis, and MinIO are **not** public — they stay on loopback or the internal Docker network.

---

## 3. Service startup order

```
postgres  →  redis  →  minio  →  evolution-api  →  next.js app
                                              └→  n8n (optional)
```

The prod compose file enforces `depends_on` + healthchecks for the first four.

---

## 4. Production deploy commands

First-time host prep:
```bash
# Docker + compose plugin, Nginx, Certbot
apt-get install -y docker.io docker-compose-plugin nginx python3-certbot-nginx
```

From the repo root, `cd platform`:
```bash
# 1) Fill env
cp .env.example .env
$EDITOR .env                     # every CHANGE_ME must be replaced

# 2) Start stateful + Evolution stack
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis minio evolution-api
# (add `n8n` at the end if you use it)

# 3) Install app deps, migrate, seed, build
npm ci
npx prisma generate
npm run migrate:deploy           # applies prisma/migrations; first run needs migrations committed
npm run db:seed                  # first deploy only (creates admin + default pack)
npm run build                    # produces .next/standalone + postbuild copies public/ and .next/static

# 4) Install and start the canonical systemd unit
sudo cp deploy/wabot.service /etc/systemd/system/wabot.service
sudo systemctl daemon-reload && sudo systemctl enable --now wabot
sudo systemctl status wabot      # should be active (running)
```

The unit runs `npm run start:prod`, which launches `.next/standalone/server.js`
on `PORT=3001` with `NODE_ENV=production`. The full unit file lives at
`deploy/wabot.service`; it assumes the repo is at `/opt/wabot/platform`.

Install the canonical Nginx vhost from `deploy/nginx.conf.example`:
```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/wabot
sudo ln -s /etc/nginx/sites-available/wabot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bot.ocianix.com
```
The vhost ships with the SSE-safe `/api/sse` block (`proxy_buffering off`,
`proxy_read_timeout 1h`) and a separate `/api/webhook/` block.

---

## 5. Webhook setup

The app registers the webhook automatically:

1. `POST /api/whatsapp` (create instance) → calls `evolutionAPI.setWebhook(name, PUBLIC_WEBHOOK_URL/api/webhook/evolution)`.
2. `POST /api/whatsapp/sync` re-applies the webhook for every known instance. Run this once after deploy and any time `PUBLIC_WEBHOOK_URL` changes.

Manual verification:
```bash
curl -s -H "apikey: $EVOLUTION_API_KEY" http://127.0.0.1:8080/webhook/find/<instanceName>
# → should list MESSAGES_UPSERT etc with the public URL
```

If Evolution lives on a different public subdomain, set `PUBLIC_WEBHOOK_URL=https://api.ocianix.com` and re-sync.

---

## 6. Backups (minimum)

Nightly pg_dump (cron):
```bash
0 3 * * * docker exec <postgres_container> pg_dump -U wabot wabot_platform | gzip > /var/backups/wabot/db-$(date +\%F).sql.gz
find /var/backups/wabot -name 'db-*.sql.gz' -mtime +14 -delete
```

MinIO data lives in the `miniodata` volume — snapshot the volume or mirror to S3.

---

## 7. Post-deploy verification checklist

Run through all of these. Every one must pass before inviting real users.

- [ ] `curl -s https://bot.ocianix.com/api/health | jq` → `{status:"ok", checks:{database:{ok:true}, redis:{ok:true}}}`
- [ ] Login at `https://bot.ocianix.com/login` with seeded admin works
- [ ] `/dashboard` loads, sidebar renders, no console errors
- [ ] Inbox opens an existing conversation, SSE connects (DevTools → Network → `/api/sse` stays pending)
- [ ] Create a WhatsApp instance from the UI → QR shows → scan → status flips to `connected` within ~20s
- [ ] `curl -s -H "apikey: $EVOLUTION_API_KEY" http://127.0.0.1:8080/webhook/find/<instanceName>` returns the public URL
- [ ] Send an inbound WhatsApp message → appears in Inbox within 2s, triggers AI reply (if `aiEnabled=true`)
- [ ] Outbound send from the Inbox UI hits the contact on WhatsApp
- [ ] `POST /api/whatsapp/sync` returns `synced:true, webhookSet:true` for each instance
- [ ] `SELECT COUNT(*) FROM ai_logs WHERE created_at > NOW()-interval '10 minutes';` > 0 after a test AI reply
- [ ] Policy refuse / escalate / collect rules still fire (test with a keyword)
- [ ] `POST /api/knowledge/embed` returns `{embedded: N}` (vector path active if OPENAI_API_KEY set)
- [ ] Stop and restart the `wabot` systemd service → app comes back up, SSE reconnects, no data loss
- [ ] `pg_dump` cron ran and produced a non-empty gzip
- [ ] Nginx access log shows HTTPS traffic only; no `:3001` leaked publicly (`ss -ltnp | grep 3001` → only `127.0.0.1`)

---

## 8. Known risks / operational notes

- **Stateful services are single-node.** Postgres and Redis are not replicated. For the 15-day pilot this is fine; plan replication before scaling.
- **Next.js standalone output** means `npm ci` + `npm run build` must be re-run on every deploy. Copy `.next/standalone/`, `.next/static/`, and `public/` to the runtime dir if you separate build and run hosts.
- **SSE** requires Nginx `proxy_buffering off` on `/api/sse`. Without it, messages appear delayed or stuck.
- **Evolution webhook URL is tenant-global per instance.** Changing `PUBLIC_WEBHOOK_URL` requires `POST /api/whatsapp/sync` to re-apply.
- **Secrets in logs:** the codebase never logs `AUTH_SECRET`, API keys, or DB passwords. Any custom `console.log` added later should respect this.
