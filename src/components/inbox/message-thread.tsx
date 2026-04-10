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
}

interface Props {
  conversationId: string
  newMessages?: Message[]
}

export function MessageThread({ conversationId, newMessages = [] }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages()
  }, [conversationId])

  useEffect(() => {
    if (newMessages.length > 0) {
      setMessages(prev => {
        const ids = new Set(prev.map(m => m.id))
        const fresh = newMessages.filter(m => !ids.has(m.id))
        return [...prev, ...fresh]
      })
    }
  }, [newMessages])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  async function loadMessages() {
    setLoading(true)
    try {
      const data = await apiFetch<{ messages: Message[] }>(
        `/api/messages?conversationId=${conversationId}&limit=100`
      )
      setMessages(data.messages)
    } catch (e) {
      console.error('Failed to load messages:', e)
    } finally {
      setLoading(false)
    }
  }

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-3 h-3 text-muted-foreground" />
      case 'sent': return <Check className="w-3 h-3 text-muted-foreground" />
      case 'delivered': return <CheckCheck className="w-3 h-3 text-muted-foreground" />
      case 'read': return <CheckCheck className="w-3 h-3 text-blue-400" />
      case 'failed': return <AlertCircle className="w-3 h-3 text-red-400" />
      default: return null
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
      {messages.map((msg) => {
        const isOutbound = msg.direction === 'outbound'
        const isAI = msg.sender === 'ai'
        const isInternal = msg.isInternal

        return (
          <div
            key={msg.id}
            className={cn(
              'flex',
              isOutbound ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[70%] rounded-2xl px-4 py-2.5 relative group',
                isInternal
                  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                  : isOutbound
                    ? isAI
                      ? 'bg-violet-600/20 border border-violet-500/20 text-foreground'
                      : 'bg-primary/20 border border-primary/20 text-foreground'
                    : 'bg-muted border border-border text-foreground'
              )}
            >
              {/* Sender indicator */}
              {isOutbound && (
                <div className="flex items-center gap-1 mb-1">
                  {isAI ? (
                    <Bot className="w-3 h-3 text-violet-400" />
                  ) : isInternal ? (
                    <span className="text-[10px] text-amber-400 font-medium">Internal Note</span>
                  ) : (
                    <User className="w-3 h-3 text-primary" />
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {isAI ? 'AI Bot' : isInternal ? '' : 'Agent'}
                  </span>
                </div>
              )}

              {/* Content */}
              {msg.contentType === 'text' ? (
                <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
              ) : msg.contentType === 'image' && msg.mediaUrl ? (
                <div>
                  <img src={msg.mediaUrl} alt="" className="rounded-lg max-w-full max-h-64 object-cover" />
                  {msg.body && <p className="text-sm mt-1">{msg.body}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">[{msg.contentType}]</span>
                  {msg.body && <span>{msg.body}</span>}
                </div>
              )}

              {/* Time + Status */}
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(msg.createdAt), 'HH:mm')}
                </span>
                {isOutbound && statusIcon(msg.status)}
              </div>
            </div>
          </div>
        )
      })}

      {messages.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No messages yet. Start the conversation!
        </div>
      )}
    </div>
  )
}
