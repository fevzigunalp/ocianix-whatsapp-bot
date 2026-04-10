'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { Phone, Mail, Calendar, Bot, User, X } from 'lucide-react'
import { format } from 'date-fns'

interface Detail {
  id: string
  status: string
  handlerType: string
  aiEnabled: boolean
  contact: {
    id: string; name: string | null; phone: string; email: string | null
    avatarUrl: string | null; tags: string[]; firstSeenAt: string; lastSeenAt: string
  }
  agent: { id: string; name: string; email: string } | null
  instance: { id: string; instanceName: string; status: string } | null
}

interface Props { conversationId: string; onClose: () => void }

export function ContactSidebar({ conversationId, onClose }: Props) {
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [conversationId])

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch<{ conversation: Detail }>(`/api/conversations/${conversationId}`)
      setData(r.conversation)
    } catch { /* empty */ } finally { setLoading(false) }
  }

  if (loading || !data) {
    return (
      <div className="w-64 shrink-0 border-l border-border bg-card flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const { contact } = data

  return (
    <div className="w-64 shrink-0 border-l border-border bg-card overflow-y-auto">
      {/* Head */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Contact</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* Profile */}
      <div className="p-4 border-b border-border text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground mx-auto mb-2">
          {contact.name?.[0]?.toUpperCase() || contact.phone.slice(-2)}
        </div>
        <h3 className="text-[13px] font-semibold text-foreground">{contact.name || 'Unknown'}</h3>
        <p className="text-[12px] text-muted-foreground">{contact.phone}</p>
      </div>

      {/* Details */}
      <div className="p-4 border-b border-border space-y-2.5">
        <Row icon={Phone} label={contact.phone} />
        {contact.email && <Row icon={Mail} label={contact.email} />}
        <Row icon={Calendar} label={`Since ${format(new Date(contact.firstSeenAt), 'dd MMM yyyy')}`} />
      </div>

      {/* Tags */}
      <div className="p-4 border-b border-border">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {contact.tags.length > 0 ? contact.tags.map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground">{t}</span>
          )) : <span className="text-[12px] text-muted-foreground">None</span>}
        </div>
      </div>

      {/* Convo info */}
      <div className="p-4 space-y-2">
        <Label>Conversation</Label>
        <InfoRow label="Status" value={data.status} />
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Handler</span>
          <span className="flex items-center gap-1 text-foreground capitalize">
            {data.aiEnabled ? <Bot className="w-3 h-3 text-accent-foreground" /> : <User className="w-3 h-3 text-primary" />}
            {data.handlerType}
          </span>
        </div>
        {data.agent && <InfoRow label="Agent" value={data.agent.name} />}
      </div>
    </div>
  )
}

function Row({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-foreground truncate">{label}</span>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{children}</p>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground capitalize">{value}</span>
    </div>
  )
}
