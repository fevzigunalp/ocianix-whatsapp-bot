'use client'

import { useState } from 'react'

type Status = 'idle' | 'sending' | 'success' | 'error'

export default function AiTestPage() {
  const [message, setMessage] = useState('Merhaba, hizmetleriniz neler?')
  const [status, setStatus] = useState<Status>('idle')
  const [httpCode, setHttpCode] = useState<number | null>(null)
  const [bodyText, setBodyText] = useState<string>('')
  const [errorText, setErrorText] = useState<string>('')

  async function send() {
    setStatus('sending')
    setHttpCode(null)
    setBodyText('')
    setErrorText('')

    let res: Response
    try {
      res = await fetch('/api/ai/test', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ message }),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus('error')
      setErrorText('NETWORK FAIL: ' + msg)
      setBodyText('(no body — network failed)')
      return
    }

    setHttpCode(res.status)

    let raw = ''
    try {
      raw = await res.text()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus('error')
      setErrorText('READ BODY FAIL: ' + msg)
      setBodyText('(no body — read failed)')
      return
    }

    let display: string
    if (raw === '') {
      display = '(empty response body, http ' + res.status + ')'
    } else {
      try {
        const parsed = JSON.parse(raw)
        display = JSON.stringify(parsed, null, 2)
        if (display === 'null' || display === undefined) {
          display = '(server returned literal null — http ' + res.status + ')'
        }
      } catch {
        display = raw
      }
    }
    setBodyText(display)

    if (!res.ok) {
      setStatus('error')
      if (res.status === 401) setErrorText('401 UNAUTHORIZED — log in at /login first.')
      else if (res.status === 405) setErrorText('405 METHOD NOT ALLOWED — endpoint not accepting POST.')
      else if (res.status >= 500) setErrorText('SERVER ERROR ' + res.status + ' — see body below.')
      else setErrorText('HTTP ' + res.status + ' — see body below.')
      return
    }

    setStatus('success')
  }

  const statusColor =
    status === 'idle'    ? '#666'    :
    status === 'sending' ? '#c48a00' :
    status === 'success' ? '#177a2f' :
                           '#b00020'

  return (
    <div style={{ maxWidth: 760, margin: '2rem auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>AI Test</h1>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={3}
        placeholder="Type a test message…"
        style={{
          width: '100%', padding: 8, fontSize: 14,
          border: '1px solid #ccc', borderRadius: 6,
          boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />

      <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={send}
          disabled={status === 'sending' || !message.trim()}
          style={{
            padding: '8px 16px', fontSize: 14, border: 0, borderRadius: 6,
            background: '#7c8cf5', color: '#fff',
            cursor: status === 'sending' ? 'wait' : 'pointer',
            opacity: !message.trim() ? 0.5 : 1,
          }}
        >
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>

        <span style={{ fontSize: 14 }}>
          status:{' '}
          <strong style={{ color: statusColor }}>{status}</strong>
          {httpCode !== null && <> · http: <strong>{httpCode}</strong></>}
        </span>
      </div>

      {errorText && (
        <div
          role="alert"
          style={{
            marginTop: 12, padding: 10,
            background: '#fde7e9', border: '1px solid #f4b5bb', borderRadius: 6,
            color: '#7a0010', fontSize: 13, whiteSpace: 'pre-wrap',
          }}
        >
          {errorText}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>response body</div>
      <pre
        style={{
          marginTop: 4, padding: 12,
          background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 6,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontSize: 13, minHeight: 80, maxHeight: 500, overflow: 'auto',
        }}
      >
        {bodyText || '(no body yet — click Send)'}
      </pre>
    </div>
  )
}
