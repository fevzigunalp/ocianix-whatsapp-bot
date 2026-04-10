'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { Phone, Mail, Calendar, Tag, Bot, User, X } from 'lucide-react'
import { format } from 'date-fns'

interface ConversationDetail {
  id: string
  status: string
  handlerType: string
  aiEnabled: boolean
  contact: {
    id: string
    name: string | null
    phone: string
    email: string | null
    avatarUrl: string | null
    tags: string[]
    firstSeenAt: string
    lastSeenAt: string
    metadata: Record<string, any>
  }
  agent: { id: string; name: string; email: string } | null
  instance: { id: string; instanceName: string; status: string } | null
}

interface Props {
  conversationId: string
  onClose: () => void
}

export function ContactSidebar({ conversationId, onClose }: Props) {
  const [data, setData] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [conversationId])

  async function loadData() {
    setLoading(true)
    try {
      const result = await apiFetch<{ conversation: ConversationDetail }>(
        `/api/conversations/${conversationId}`
      )
      setData(result.conversation)
    } catch (e) {
      console.error('Failed to load conversation:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="w-[280px] border-l border-border flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const { contact } = data

  return (
    <div className="w-[280px] border-l border-border overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Contact Info */}
      <div className="p-4 border-b border-border">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-semibold text-muted-foreground mb-3">
            {contact.name?.[0]?.toUpperCase() || contact.phone.slice(-2)}
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {contact.name || 'Unknown'}
          </h3>
          <p className="text-xs text-muted-foreground">{contact.phone}</p>
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs">
            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-foreground">{contact.phone}</span>
          </div>
          {contact.email && (
            <div className="flex items-center gap-2 text-xs">
              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-foreground">{contact.email}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              First seen {format(new Date(contact.firstSeenAt), 'dd MMM yyyy')}
            </span>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="p-4 border-b border-border">
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tags</h4>
        <div className="flex flex-wrap gap-1.5">
          {contact.tags.length > 0 ? (
            contact.tags.map((tag) => (
              <span key={tag} className="text-[11px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                {tag}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No tags</span>
          )}
        </div>
      </div>

      {/* Conversation Info */}
      <div className="p-4 border-b border-border">
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Conversation</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Status</span>
            <span className="text-foreground capitalize">{data.status}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Handler</span>
            <div className="flex items-center gap-1">
              {data.aiEnabled ? (
                <Bot className="w-3 h-3 text-[#9b8cf5]" />
              ) : (
                <User className="w-3 h-3 text-[#6b9cf7]" />
              )}
              <span className="text-foreground capitalize">{data.handlerType}</span>
            </div>
          </div>
          {data.agent && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Agent</span>
              <span className="text-foreground">{data.agent.name}</span>
            </div>
          )}
          {data.instance && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Instance</span>
              <span className="text-foreground">{data.instance.instanceName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
