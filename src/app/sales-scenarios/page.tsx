'use client'

import { useEffect, useState } from 'react'

type Turn = {
  say: string
  expected: any
  signal: { type: string; offer: string | null; category: string | null }
  stage: string
  collected: Record<string, any>
  missing: string[]
  leadEligible: boolean
  failures: string[]
  pass: boolean
}
type ScenarioResult = {
  id: number
  name: string
  description: string
  pass: boolean
  turns: Turn[]
}
type Summary = {
  total: number
  pass: number
  fail: number
  results: ScenarioResult[]
}

export default function SalesScenariosPage() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function run() {
    setLoading(true); setErr(''); setData(null)
    try {
      const r = await fetch('/api/sales/scenarios', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const j = await r.json()
      if (!r.ok || !j?.success) setErr(j?.error || `HTTP ${r.status}`)
      else setData(j.data)
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { run() }, [])

  return (
    <div style={{ maxWidth: 980, margin: '1.5rem auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22 }}>Sales Scenarios — Phase 7</h1>
        <button
          onClick={run}
          disabled={loading}
          style={{
            padding: '8px 14px', fontSize: 13, border: 0, borderRadius: 6,
            background: '#7c8cf5', color: '#fff', cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Running…' : 'Re-run all'}
        </button>
      </div>

      {err && (
        <div style={{ padding: 10, background: '#fde7e9', border: '1px solid #f4b5bb', borderRadius: 6, color: '#7a0010' }}>
          {err}
        </div>
      )}

      {data && (
        <div style={{ marginBottom: 16, padding: 12,
          background: data.fail === 0 ? '#e8f5ed' : '#fff4d9',
          border: data.fail === 0 ? '1px solid #b4d9bf' : '1px solid #ddc474',
          borderRadius: 8, fontSize: 14 }}>
          <strong>
            {data.fail === 0
              ? `✓ ALL ${data.total} PASS`
              : `⚠ ${data.pass} / ${data.total} passed · ${data.fail} FAILED`}
          </strong>
        </div>
      )}

      {data?.results.map(s => (
        <div key={s.id} style={{
          marginBottom: 14, padding: 12, borderRadius: 8,
          border: s.pass ? '1px solid #b4d9bf' : '1px solid #f4b5bb',
          background: s.pass ? '#f6fbf7' : '#fdf1f3',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 12,
              background: s.pass ? '#177a2f' : '#b00020', color: '#fff',
            }}>
              {s.pass ? 'PASS' : 'FAIL'}
            </span>
            <strong style={{ fontSize: 14 }}>#{s.id} · {s.name}</strong>
          </div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{s.description}</div>

          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
            {s.turns.map((t, i) => (
              <div key={i} style={{
                padding: 8, borderRadius: 4, fontSize: 12,
                background: t.pass ? '#fff' : '#ffeff2',
                border: t.pass ? '1px solid #e0e0e0' : '1px solid #f4b5bb',
              }}>
                <div><strong>turn {i + 1}:</strong> "{t.say}"</div>
                <div style={{ marginTop: 4, color: '#555' }}>
                  signal: <code>{t.signal.type}</code>
                  {t.signal.offer && <> → offer: <code>{t.signal.offer}</code></>}
                  {t.signal.category && <> → cat: <code>{t.signal.category}</code></>}
                  {' · '}stage: <code>{t.stage}</code>
                  {' · '}lead: <code>{String(t.leadEligible)}</code>
                </div>
                <div style={{ marginTop: 4, color: '#555' }}>
                  collected: <code>{JSON.stringify(t.collected)}</code>
                  {' · '}missing: <code>[{t.missing.join(', ')}]</code>
                </div>
                {t.failures.length > 0 && (
                  <div style={{ marginTop: 4, color: '#7a0010' }}>
                    FAILURES: {t.failures.map((f, k) => <div key={k}>• {f}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
