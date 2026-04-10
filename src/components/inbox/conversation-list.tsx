'use client'

import { cn } from '@/lib/utils'
import { Bot, User, Search, Filter } from 'lucide-react'
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
  contact: {
    id: string
    name: string | null
    phone: string
    avatarUrl: string | null
    tags: string[]
  }
  messages: Array<{
    body: string | null
    contentType: string
    sender: string
    createdAt: string
  }>
  agent: { id: string; name: string } | null
}

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
  refreshKey?: number
}

export function ConversationList({ selectedId, onSelect, refreshKey }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConversations()
  }, [filter, refreshKey])

  async function loadConversations() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (filter) params.set('status', filter)
      if (search) params.set('search', search)

      const data = await apiFetch<{ conversations: Conversation[] }>(
        `/api/conversations?${params}`
      )
      setConversations(data.conversations)
    } catch (e) {
      console.error('Failed to load conversations:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    loadConversations()
  }

  const statusColors: Record<string, string> = {
    open: 'bg-[#6bc9a0]',
    pending: 'bg-[#f0b775]',
    resolved: 'bg-[#6b9cf7]',
    closed: 'bg-[#bfb8ae]',
  }

  return (
    <div className="flex flex-col h-full border-r border-border w-[340px] shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
          <span className="text-xs text-muted-foreground">{conversations.length} conversations</span>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full h-8 pl-8 pr-3 bg-muted/50 border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </form>

        {/* Filters */}
        <div className="flex gap-1">
          {['', 'open', 'pending', 'resolved'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                filter === f
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50'
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
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => {
            const lastMsg = conv.messages[0]
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  'w-full px-3 py-3 flex items-start gap-3 border-b border-border/50 transition-colors text-left',
                  selectedId === conv.id
                    ? 'bg-primary/5 border-l-2 border-l-primary'
                    : 'hover:bg-muted/30'
                )}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                    {conv.contact.name?.[0]?.toUpperCase() || conv.contact.phone.slice(-2)}
                  </div>
                  {conv.aiEnabled && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#9b8cf5]/15 flex items-center justify-center">
                      <Bot className="w-2.5 h-2.5 text-[#9b8cf5]" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">
                      {conv.contact.name || conv.contact.phone}
                    </span>
                    {lastMsg && (
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {formatDistanceToNow(new Date(lastMsg.createdAt), {
                          addSuffix: true,
                          locale: tr,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColors[conv.status] || 'bg-slate-500')} />
                    <p className="text-xs text-muted-foreground truncate">
                      {lastMsg
                        ? lastMsg.contentType !== 'text'
                          ? `[${lastMsg.contentType}]`
                          : lastMsg.body || '...'
                        : 'No messages'}
                    </p>
                  </div>
                  {/* Tags */}
                  {conv.contact.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {conv.contact.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unread badge */}
                {conv.unreadCount > 0 && (
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white">
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
