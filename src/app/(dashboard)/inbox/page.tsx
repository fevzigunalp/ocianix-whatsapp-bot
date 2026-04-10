'use client'

import { useState } from 'react'
import { ConversationList } from '@/components/inbox/conversation-list'
import { MessageThread } from '@/components/inbox/message-thread'
import { MessageInput } from '@/components/inbox/message-input'
import { ContactSidebar } from '@/components/inbox/contact-sidebar'
import { useSSE } from '@/hooks/use-sse'
import { apiFetch } from '@/hooks/use-api'
import { MessageSquare, PanelRight } from 'lucide-react'

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [newMessages, setNewMessages] = useState<any[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useSSE({
    message: (data) => {
      if (data.message?.conversation?.id === selectedId) {
        // SSE delivered a message for current conversation — append if not already shown
        setNewMessages(prev => {
          const exists = prev.some(m => m.id === data.message.id || m.whatsappMsgId === data.message.whatsappMsgId)
          if (exists) {
            // Update status of existing optimistic message
            return prev.map(m =>
              (m.whatsappMsgId && m.whatsappMsgId === data.message.whatsappMsgId) ||
              (m._optimistic && m.body === data.message.body)
                ? { ...data.message, _optimistic: false }
                : m
            )
          }
          return [...prev, data.message]
        })
      }
      setRefreshKey(prev => prev + 1)
    },
    status_update: (data) => {
      // Update message status (sent → delivered → read)
      setNewMessages(prev =>
        prev.map(m =>
          m.whatsappMsgId === data.whatsappMsgId
            ? { ...m, status: data.status }
            : m
        )
      )
    },
    conversation_update: () => setRefreshKey(prev => prev + 1),
  })

  async function handleSend(body: string, isInternal: boolean) {
    if (!selectedId) return

    // 1. Optimistic insert — show immediately
    const optimisticMsg = {
      id: `opt-${Date.now()}`,
      conversationId: selectedId,
      direction: 'outbound',
      sender: isInternal ? 'agent' : 'agent',
      contentType: 'text',
      body,
      mediaUrl: null,
      whatsappMsgId: null,
      status: isInternal ? 'delivered' : 'sending',
      isInternal,
      createdAt: new Date().toISOString(),
      _optimistic: true,
    }
    setNewMessages(prev => [...prev, optimisticMsg])

    try {
      // 2. Send to API
      const result = await apiFetch<{ message: any }>('/api/messages', {
        method: 'POST',
        body: { conversationId: selectedId, body, isInternal },
      })

      // 3. Replace optimistic message with real one
      if (result.message) {
        setNewMessages(prev =>
          prev.map(m =>
            m.id === optimisticMsg.id
              ? { ...result.message, _optimistic: false }
              : m
          )
        )
      }
    } catch (error) {
      // 4. Mark as failed
      setNewMessages(prev =>
        prev.map(m =>
          m.id === optimisticMsg.id
            ? { ...m, status: 'failed', _optimistic: false }
            : m
        )
      )
    }

    setRefreshKey(prev => prev + 1)
  }

  async function handleToggleAI() {
    if (!selectedId) return
    const next = !aiEnabled
    setAiEnabled(next)
    await apiFetch(`/api/conversations/${selectedId}`, { method: 'PATCH', body: { aiEnabled: next } })
  }

  function handleSelect(id: string) {
    setSelectedId(id)
    setNewMessages([])
  }

  return (
    <div className="page-full">
      <ConversationList selectedId={selectedId} onSelect={handleSelect} refreshKey={refreshKey} />

      {selectedId ? (
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <div className="h-12 shrink-0 border-b border-border flex items-center justify-between px-4 bg-card">
            <span className="text-[13px] font-medium text-foreground">Conversation</span>
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
          <MessageThread conversationId={selectedId} newMessages={newMessages} />
          <MessageInput conversationId={selectedId} aiEnabled={aiEnabled} onSend={handleSend} onToggleAI={handleToggleAI} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground">Select a conversation</h3>
            <p className="text-[12px] text-muted-foreground mt-1">Choose from the list to start</p>
          </div>
        </div>
      )}

      {selectedId && showSidebar && (
        <ContactSidebar conversationId={selectedId} onClose={() => setShowSidebar(false)} />
      )}
    </div>
  )
}
