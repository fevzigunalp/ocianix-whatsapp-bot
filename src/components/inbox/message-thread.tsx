'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/hooks/use-api'
import { Bot, User, Check, CheckCheck, Clock, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'

interface Message {
  id: string
  direction: string
  sender: string
  contentType: string
  body: string | null
  mediaUrl: string | null
  status: string
  isInternal: boolean
  createdAt: string
  whatsappMsgId?: string | null
  _optimistic?: boolean
}

interface Props {
  conversationId: string
  newMessages?: Message[]
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  sending: <Clock className="w-3 h-3 text-muted-foreground animate-pulse" />,
  pending: <Clock className="w-3 h-3 text-muted-foreground" />,
  sent: <Check className="w-3 h-3 text-muted-foreground" />,
  delivered: <CheckCheck className="w-3 h-3 text-muted-foreground" />,
  read: <CheckCheck className="w-3 h-3 text-info" />,
  failed: <AlertCircle className="w-3 h-3 text-destructive" />,
}

export function MessageThread({ conversationId, newMessages = [] }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [conversationId])

  useEffect(() => {
    if (newMessages.length > 0) {
      setMessages(prev => {
        let merged = [...prev]
        for (const nm of newMessages) {
          // Check if already exists by id
          const idxById = merged.findIndex(m => m.id === nm.id)
          if (idxById >= 0) {
            // Update existing (e.g. status change)
            merged[idxById] = { ...merged[idxById], ...nm }
            continue
          }
          // Check if this replaces an optimistic message (same body + direction)
          const idxOpt = merged.findIndex(m =>
            m._optimistic && m.body === nm.body && m.direction === nm.direction
          )
          if (idxOpt >= 0) {
            merged[idxOpt] = { ...nm, _optimistic: false }
            continue
          }
          // Check by whatsappMsgId
          if (nm.whatsappMsgId) {
            const idxWa = merged.findIndex(m => m.whatsappMsgId === nm.whatsappMsgId)
            if (idxWa >= 0) {
              merged[idxWa] = { ...merged[idxWa], ...nm }
              continue
            }
          }
          // New message
          merged.push(nm)
        }
        return merged
      })
    }
  }, [newMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<{ messages: Message[] }>(`/api/messages?conversationId=${conversationId}&limit=100`)
      setMessages(data.messages)
    } catch { /* empty */ } finally { setLoading(false) }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1.5">
      {messages.map((msg) => {
        const out = msg.direction === 'outbound'
        const ai = msg.sender === 'ai'
        const internal = msg.isInternal

        return (
          <div key={msg.id} className={cn('flex', out ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] sm:max-w-[75%] lg:max-w-[65%] rounded-2xl px-3.5 py-2 text-foreground',
              internal
                ? 'bg-bubble-internal border border-bubble-internal-border'
                : out
                  ? ai
                    ? 'bg-bubble-ai border border-bubble-ai-border'
                    : 'bg-bubble-agent border border-bubble-agent-border'
                  : 'bg-bubble-customer border border-bubble-customer-border shadow-sm'
            )}>
              {/* Sender label */}
              {out && (
                <div className="flex items-center gap-1 mb-0.5">
                  {ai ? <Bot className="w-3 h-3 text-accent-foreground" /> : internal ? null : <User className="w-3 h-3 text-primary" />}
                  <span className="text-[10px] text-muted-foreground">
                    {ai ? 'AI Bot' : internal ? 'Internal Note' : 'Agent'}
                  </span>
                </div>
              )}

              {/* Body */}
              {msg.contentType === 'text' ? (
                <p className="text-[13px] whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
              ) : msg.contentType === 'image' && msg.mediaUrl ? (
                <div>
                  <img src={msg.mediaUrl} alt="" className="rounded-lg max-w-full max-h-60 object-cover" />
                  {msg.body && <p className="text-[13px] mt-1">{msg.body}</p>}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">[{msg.contentType}] {msg.body || ''}</p>
              )}

              {/* Time + status */}
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <span className="text-[10px] text-muted-foreground">{format(new Date(msg.createdAt), 'HH:mm')}</span>
                {out && STATUS_ICON[msg.status]}
              </div>
            </div>
          </div>
        )
      })}

      {messages.length === 0 && (
        <p className="text-center py-12 text-[13px] text-muted-foreground">No messages yet</p>
      )}
    </div>
  )
}
