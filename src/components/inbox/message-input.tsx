'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, StickyNote, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  conversationId: string
  aiEnabled: boolean
  onSend: (body: string, isInternal: boolean) => Promise<void>
  onToggleAI?: () => void
}

export function MessageInput({ conversationId, aiEnabled, onSend, onToggleAI }: Props) {
  const [text, setText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setText(''); setIsInternal(false) }, [conversationId])

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try { await onSend(text.trim(), isInternal); setText(''); ref.current?.focus() }
    finally { setSending(false) }
  }

  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }
  }, [text])

  return (
    <div className="shrink-0 border-t border-border bg-card p-3">
      {isInternal && (
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <StickyNote className="w-3 h-3 text-warning" />
          <span className="text-[11px] text-warning font-medium">Internal note — not sent to customer</span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={isInternal ? 'Write an internal note...' : 'Type a message...'}
          rows={1}
          className={cn(
            'flex-1 resize-none px-3.5 py-2 bg-input border rounded-xl text-[13px] text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 transition-colors',
            isInternal ? 'border-warning/30 focus:ring-warning/30' : 'border-border focus:ring-primary/30'
          )}
        />
        <button onClick={() => setIsInternal(!isInternal)} className={cn(
          'p-2 rounded-lg transition-colors',
          isInternal ? 'bg-warning/10 text-warning' : 'text-muted-foreground hover:bg-muted/60'
        )}>
          <StickyNote className="w-4 h-4" />
        </button>
        <button onClick={onToggleAI} className={cn(
          'p-2 rounded-lg transition-colors',
          aiEnabled ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted/60'
        )}>
          <Bot className="w-4 h-4" />
        </button>
        <button onClick={handleSend} disabled={!text.trim() || sending} className="p-2.5 bg-primary rounded-xl text-primary-foreground disabled:opacity-30 hover:opacity-90 transition-opacity">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
