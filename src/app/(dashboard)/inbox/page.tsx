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
        setNewMessages(prev => [...prev, data.message])
      }
      setRefreshKey(prev => prev + 1)
    },
    conversation_update: () => setRefreshKey(prev => prev + 1),
  })

  async function handleSend(body: string, isInternal: boolean) {
    if (!selectedId) return
    await apiFetch('/api/messages', { method: 'POST', body: { conversationId: selectedId, body, isInternal } })
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
      {/* Conversation list */}
      <ConversationList selectedId={selectedId} onSelect={handleSelect} refreshKey={refreshKey} />

      {/* Chat area */}
      {selectedId ? (
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          {/* Chat header */}
          <div className="h-12 shrink-0 border-b border-border flex items-center justify-between px-4 bg-card">
            <span className="text-[13px] font-medium text-foreground">Conversation</span>
            <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
              <PanelRight className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <MessageThread conversationId={selectedId} newMessages={newMessages} />

          {/* Input */}
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

      {/* Contact sidebar */}
      {selectedId && showSidebar && (
        <ContactSidebar conversationId={selectedId} onClose={() => setShowSidebar(false)} />
      )}
    </div>
  )
}
