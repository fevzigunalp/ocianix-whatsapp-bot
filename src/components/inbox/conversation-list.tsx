'use client'

import { cn } from '@/lib/utils'
import { Bot, Search } from 'lucide-react'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

interface Conversation {
  id: string
  status: string
  handlerType: string
  aiEnabled: boolean
  unreadCount: number
  lastMessageAt: string | null
  contact: { id: string; name: string | null; phone: string; avatarUrl: string | null; tags: string[] }
  messages: Array<{ body: string | null; contentType: string; sender: string; createdAt: string }>
  agent: { id: string; name: string } | null
}

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
  refreshKey?: number
}

const STATUS_DOT: Record<string, string> = {
  open: 'bg-success',
  pending: 'bg-warning',
  resolved: 'bg-info',
  closed: 'bg-muted-foreground',
}

export function ConversationList({ selectedId, onSelect, refreshKey }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [filter, refreshKey])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (filter) params.set('status', filter)
      if (search) params.set('search', search)
      const data = await apiFetch<{ conversations: Conversation[] }>(`/api/conversations?${params}`)
      setConversations(data.conversations)
    } catch { /* empty */ } finally { setLoading(false) }
  }

  return (
    <div className="w-72 lg:w-80 shrink-0 flex flex-col border-r border-border bg-card">
      {/* Head */}
      <div className="shrink-0 p-3 space-y-2 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-foreground">Inbox</h2>
          <span className="text-[11px] text-muted-foreground">{conversations.length}</span>
        </div>

        <form onSubmit={e => { e.preventDefault(); load() }} className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full h-8 pl-8 pr-3 bg-muted/60 border border-transparent rounded-lg text-[12px] text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/30 transition-colors"
          />
        </form>

        <div className="flex gap-1">
          {['', 'open', 'pending', 'resolved'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
                filter === f ? 'bg-primary/8 text-primary' : 'text-muted-foreground hover:bg-muted/60'
              )}
            >
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-center py-10 text-[13px] text-muted-foreground">No conversations</p>
        ) : (
          conversations.map(conv => {
            const last = conv.messages[0]
            const selected = selectedId === conv.id
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  'w-full px-3 py-3 flex items-start gap-2.5 border-b border-border/40 text-left transition-colors',
                  selected ? 'bg-primary/5' : 'hover:bg-muted/40'
                )}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-[12px] font-medium text-muted-foreground">
                    {conv.contact.name?.[0]?.toUpperCase() || conv.contact.phone.slice(-2)}
                  </div>
                  {conv.aiEnabled && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                      <Bot className="w-2.5 h-2.5 text-accent-foreground" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-foreground truncate">
                      {conv.contact.name || conv.contact.phone}
                    </span>
                    {last && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(last.createdAt), { addSuffix: true, locale: tr })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[conv.status] || 'bg-muted-foreground')} />
                    <p className="text-[12px] text-muted-foreground truncate">
                      {last ? (last.contentType !== 'text' ? `[${last.contentType}]` : last.body || '...') : 'No messages'}
                    </p>
                  </div>
                </div>

                {/* Unread */}
                {conv.unreadCount > 0 && (
                  <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground px-1">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
