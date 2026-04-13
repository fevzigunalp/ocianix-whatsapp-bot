'use client'

import { useState } from 'react'

export default function AiTestPage() {
  const [message, setMessage] = useState('Merhaba, hizmetleriniz neler?')
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  async function send() {
    setLoading(true)
    setResult('')
    try {
      const r = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await r.json()
      setResult(JSON.stringify(data, null, 2))
    } catch (err: any) {
      setResult('ERROR: ' + (err?.message || String(err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto', padding: '1rem', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>AI Test</h1>
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={3}
        style={{ width: '100%', padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 6 }}
      />
      <button
        onClick={send}
        disabled={loading || !message.trim()}
        style={{
          marginTop: 8, padding: '8px 16px', fontSize: 14,
          background: '#7c8cf5', color: '#fff', border: 0, borderRadius: 6,
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? 'Sending…' : 'Send'}
      </button>
      <pre
        style={{
          marginTop: 16, padding: 12, background: '#f5f5f5', border: '1px solid #ddd',
          borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 13, minHeight: 80,
        }}
      >
        {result || '(response will appear here)'}
      </pre>
    </div>
  )
}
