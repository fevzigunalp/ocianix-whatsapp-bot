'use client'

import { useState } from 'react'
import { TestTube, Send, Bot } from 'lucide-react'

export default function TestSuitePage() {
  const [testMessage, setTestMessage] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)

  async function runTest() {
    if (!testMessage.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testMessage }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ error: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Test Suite</h1>
        <p className="text-sm text-muted-foreground mt-1">Test AI responses before publishing</p>
      </div>

      {/* Test Chat */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Test Chat</h2>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={testMessage}
            onChange={e => setTestMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runTest()}
            placeholder="Type a test message..."
            className="flex-1 h-10 px-4 bg-muted/50 border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={runTest}
            disabled={testing || !testMessage.trim()}
            className="h-10 px-4 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-30 hover:bg-primary/80 transition-colors flex items-center gap-1.5"
          >
            {testing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Test
          </button>
        </div>

        {/* Result */}
        {testResult && (
          <div className="bg-muted/30 rounded-xl p-4 space-y-3">
            {testResult.error ? (
              <p className="text-sm text-red-400">{testResult.error}</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-medium text-foreground">AI Response</span>
                </div>
                <p className="text-sm text-foreground">{testResult.data?.response || testResult.response || 'No response'}</p>
                {testResult.data && (
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Decision</span>
                      <span className="text-xs font-medium text-foreground">{testResult.data.decision}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Intent</span>
                      <span className="text-xs font-medium text-foreground">{testResult.data.intent}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Confidence</span>
                      <span className="text-xs font-medium text-foreground">{testResult.data.confidence}%</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
