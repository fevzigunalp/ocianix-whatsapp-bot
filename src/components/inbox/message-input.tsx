'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, StickyNote, Bot } from 'lucide-react'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setText('')
    setIsInternal(false)
  }, [conversationId])

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await onSend(text.trim(), isInternal)
      setText('')
      textareaRef.current?.focus()
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [text])

  return (
    <div className="border-t border-border bg-card/50 p-3">
      {/* Mode indicator */}
      {isInternal && (
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <StickyNote className="w-3 h-3 text-amber-400" />
          <span className="text-[11px] text-amber-400 font-medium">Internal Note — won't be sent to customer</span>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isInternal ? 'Write an internal note...' : 'Type a message...'}
            className={cn(
              'w-full resize-none px-4 py-2.5 bg-muted/50 border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 transition-all',
              isInternal
                ? 'border-amber-500/30 focus:ring-amber-500/30'
                : 'border-border focus:ring-ring'
            )}
            rows={1}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Internal note toggle */}
          <button
            onClick={() => setIsInternal(!isInternal)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              isInternal
                ? 'bg-amber-500/10 text-amber-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            title="Toggle internal note"
          >
            <StickyNote className="w-4 h-4" />
          </button>

          {/* AI toggle */}
          <button
            onClick={onToggleAI}
            className={cn(
              'p-2 rounded-lg transition-colors',
              aiEnabled
                ? 'bg-violet-500/10 text-violet-400'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            title={aiEnabled ? 'AI active' : 'AI paused'}
          >
            <Bot className="w-4 h-4" />
          </button>

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="p-2.5 bg-primary rounded-xl text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/80 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
