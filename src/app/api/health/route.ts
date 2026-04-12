/**
 * GET /api/health
 *
 * Cheap liveness + readiness probe. Checks Postgres and Redis round-trips.
 * Safe to hit from uptime monitors / k8s probes — no auth, no PII.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {}

  const t1 = Date.now()
  try {
    await db.$queryRawUnsafe('SELECT 1')
    checks.database = { ok: true, latencyMs: Date.now() - t1 }
  } catch (err: any) {
    checks.database = { ok: false, latencyMs: Date.now() - t1, error: err.message }
  }

  const t2 = Date.now()
  try {
    const pong = await redis.ping()
    checks.redis = { ok: pong === 'PONG', latencyMs: Date.now() - t2 }
  } catch (err: any) {
    checks.redis = { ok: false, latencyMs: Date.now() - t2, error: err.message }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '0.1.0',
      checks,
    },
    { status: allOk ? 200 : 503 },
  )
}
