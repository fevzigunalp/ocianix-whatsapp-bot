'use client'

import { useState } from 'react'

type SalesFlow = {
  stage: string
  categoryId: string | null
  offerId: string | null
  collected: Record<string, string | number>
  askedFor: string[]
  lastAskedFor: string | null
  updatedAt: string
}

type Turn = {
  userMessage: string
  http: number | null
  signal: any
  prev: SalesFlow
  next: SalesFlow
  missingFields: string[]
  leadEligible: boolean
  guidance: string | null
  leadParamsIfReady: any
  error?: string
}

const INITIAL: SalesFlow = {
  stage: 'idle',
  categoryId: null,
  offerId: null,
  collected: {},
  askedFor: [],
  lastAskedFor: null,
  updatedAt: new Date(0).toISOString(),
}

export default function SalesTestPage() {
  const [message, setMessage] = useState('Kapadokyada hizmetleriniz neler?')
  const [contactName, setContactName] = useState('')
  const [state, setState] = useState<SalesFlow>(INITIAL)
  const [turns, setTurns] = useState<Turn[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState<any>(null)

  async function send() {
    if (!message.trim()) return
    setLoading(true)
    setErr('')
    let res: Response
    try {
      res = await fetch('/api/sales/test', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message, state, contactName: contactName || null }),
      })
    } catch (e: any) {
      setErr('NETWORK: ' + (e?.message || String(e)))
      setLoading(false)
      return
    }
    const http = res.status
    let raw = ''
    try { raw = await res.text() } catch {}
    let body: any = null
    try { body = JSON.parse(raw) } catch {}

    if (!res.ok || !body?.success) {
      const turn: Turn = {
        userMessage: message,
        http,
        signal: null, prev: state, next: state,
        missingFields: [], leadEligible: false, guidance: null, leadParamsIfReady: null,
        error: body?.error || raw || 'unknown',
      }
      setTurns(t => [...t, turn])
      setErr(`HTTP ${http}: ${turn.error}`)
    } else {
      const d = body.data
      setTurns(t => [...t, {
        userMessage: message,
        http,
        signal: d.signal,
        prev: d.prev,
        next: d.next,
        missingFields: d.missingFields,
        leadEligible: d.leadEligible,
        guidance: d.guidance,
        leadParamsIfReady: d.leadParamsIfReady,
      }])
      setState(d.next)
    }
    setMessage('')
    setLoading(false)
  }

  function reset() {
    setState(INITIAL)
    setTurns([])
    setMessage('Kapadokyada hizmetleriniz neler?')
    setErr('')
    setCommitResult(null)
  }

  async function commitLead() {
    setCommitting(true)
    setErr('')
    setCommitResult(null)
    try {
      const r = await fetch('/api/sales/commit', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, contactName: contactName || null }),
      })
      const raw = await r.text()
      let body: any = null
      try { body = JSON.parse(raw) } catch {}
      if (!r.ok || !body?.success) {
        setErr(`commit failed: HTTP ${r.status} ${body?.error || raw.slice(0, 200)}`)
      } else {
        setCommitResult(body.data)
      }
    } catch (e: any) {
      setErr('commit network: ' + (e?.message || String(e)))
    } finally {
      setCommitting(false)
    }
  }

  const leadReady = state.stage === 'lead_ready'

  return (
    <div style={{ maxWidth: 900, margin: '1.5rem auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Sales Flow Test</h1>
      <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
        Pure state-machine probe. No AI call. Walk a full customer conversation and see signal / stage / missing fields / guidance / lead readiness at every turn.
      </p>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={contactName}
          onChange={e => setContactName(e.target.value)}
          placeholder="contact name (optional)"
          style={{ padding: 6, fontSize: 13, border: '1px solid #ccc', borderRadius: 6, width: 220 }}
        />
        <button
          onClick={reset}
          style={{
            padding: '6px 12px', fontSize: 13, border: '1px solid #ccc', borderRadius: 6,
            background: '#fff', cursor: 'pointer',
          }}
        >
          Reset conversation
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>
          stage: <strong>{state.stage}</strong>
          {state.categoryId && <> · cat: <strong>{state.categoryId}</strong></>}
          {state.offerId && <> · offer: <strong>{state.offerId}</strong></>}
          {state.lastAskedFor && <> · asking: <strong>{state.lastAskedFor}</strong></>}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={2}
          placeholder="Customer message…"
          style={{ flex: 1, padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 6, fontFamily: 'inherit' }}
        />
        <button
          onClick={send}
          disabled={loading || !message.trim()}
          style={{
            padding: '8px 16px', fontSize: 14, border: 0, borderRadius: 6,
            background: '#7c8cf5', color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            opacity: !message.trim() ? 0.5 : 1, alignSelf: 'flex-start',
          }}
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 10, padding: 8, background: '#fde7e9', border: '1px solid #f4b5bb', borderRadius: 6, color: '#7a0010', fontSize: 13 }}>
          {err}
        </div>
      )}

      {leadReady && !commitResult && (
        <div style={{ marginTop: 12, padding: 10, background: '#e8f5ed', border: '1px solid #b4d9bf', borderRadius: 6 }}>
          <div style={{ color: '#177a2f', fontWeight: 600, marginBottom: 6 }}>✓ Lead ready — commit to DB?</div>
          <button
            onClick={commitLead}
            disabled={committing}
            style={{
              padding: '8px 16px', fontSize: 14, border: 0, borderRadius: 6,
              background: '#177a2f', color: '#fff',
              cursor: committing ? 'wait' : 'pointer',
            }}
          >
            {committing ? 'Committing…' : 'Commit Lead (run create_lead action)'}
          </button>
        </div>
      )}

      {commitResult && (
        <div style={{ marginTop: 12, padding: 10, background: '#eef6ff', border: '1px solid #b8d4f5', borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Action status: <span style={{ color: commitResult.actionStatus === 'success' ? '#177a2f' : '#7a0010' }}>{commitResult.actionStatus}</span>
          </div>
          {commitResult.deal && (
            <div style={{ fontSize: 13 }}>
              <div>✓ Deal created · id: <code>{commitResult.deal.id}</code></div>
              <div>title: {commitResult.deal.title}</div>
              <div>stage: {commitResult.deal.stage?.name}</div>
              <div>action_log id: <code>{commitResult.actionLogId}</code></div>
              <div>conversation id: <code>{commitResult.conversationId}</code></div>
              <div>contact id: <code>{commitResult.contactId}</code></div>
            </div>
          )}
          <pre style={{ marginTop: 8, padding: 8, background: '#fff', border: '1px solid #eee', borderRadius: 4, fontSize: 11, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(commitResult, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        {turns.map((t, i) => (
          <div key={i} style={{ marginBottom: 14, padding: 10, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}>
            <div style={{ fontSize: 13 }}>
              <strong style={{ color: '#333' }}>Turn {i + 1}</strong>
              <span style={{ color: '#666', marginLeft: 8 }}>http: {t.http}</span>
            </div>
            <div style={{ marginTop: 6, padding: 6, background: '#eef6ff', borderRadius: 4, fontSize: 13 }}>
              <strong>customer:</strong> {t.userMessage}
            </div>

            {t.error ? (
              <div style={{ marginTop: 6, color: '#7a0010', fontSize: 13 }}>ERROR: {t.error}</div>
            ) : (
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ color: '#666' }}>signal</div>
                  <div><strong>{t.signal?.type}</strong>
                    {t.signal?.matchedCategory && <> → {t.signal.matchedCategory.label}</>}
                    {t.signal?.matchedOffer && <> → {t.signal.matchedOffer.label}</>}
                  </div>
                  {t.signal?.extracted && Object.keys(t.signal.extracted).length > 0 && (
                    <div style={{ marginTop: 4, color: '#555' }}>
                      extracted: {JSON.stringify(t.signal.extracted)}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ color: '#666' }}>stage</div>
                  <div><strong>{t.prev.stage}</strong> → <strong style={{ color: t.leadEligible ? '#177a2f' : '#333' }}>{t.next.stage}</strong></div>
                  <div style={{ marginTop: 4, color: '#555' }}>
                    collected: {Object.keys(t.next.collected).length ? JSON.stringify(t.next.collected) : '(none)'}
                  </div>
                  <div style={{ marginTop: 4, color: '#555' }}>
                    missing: {t.missingFields.length ? t.missingFields.join(', ') : '(none)'}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ color: '#666' }}>guidance (what AI would be told to ask)</div>
                  <pre style={{ marginTop: 4, padding: 8, background: '#fff', border: '1px solid #eee', borderRadius: 4, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                    {t.guidance || '(no guidance — state unchanged)'}
                  </pre>
                </div>
                {t.leadEligible && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: '#177a2f' }}>✓ LEAD ELIGIBLE — would call create_lead with:</div>
                    <pre style={{ marginTop: 4, padding: 8, background: '#e8f5ed', border: '1px solid #b4d9bf', borderRadius: 4, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {JSON.stringify(t.leadParamsIfReady, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
