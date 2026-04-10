'use client'

import { useState, useCallback } from 'react'
import { ConversationList } from '@/components/inbox/conversation-list'
import { MessageThread } from '@/components/inbox/message-thread'
import { MessageInput } from '@/components/inbox/message-input'
import { ContactSidebar } from '@/components/inbox/contact-sidebar'
import { useSSE } from '@/hooks/use-sse'
import { apiFetch } from '@/hooks/use-api'
import { MessageSquare, PanelRight } from 'lucide-react'

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [newMessages, setNewMessages] = useState<any[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // SSE for real-time updates
  useSSE({
    message: (data) => {
      // Add to thread if it belongs to current conversation
      if (data.message?.conversation?.id === selectedId) {
        setNewMessages(prev => [...prev, data.message])
      }
      // Refresh conversation list
      setRefreshKey(prev => prev + 1)
    },
    conversation_update: () => {
      setRefreshKey(prev => prev + 1)
    },
  })

  async function handleSend(body: string, isInternal: boolean) {
    if (!selectedId) return
    await apiFetch('/api/messages', {
      method: 'POST',
      body: { conversationId: selectedId, body, isInternal },
    })
  }

  async function handleToggleAI() {
    if (!selectedId) return
    const newState = !aiEnabled
    setAiEnabled(newState)
    await apiFetch(`/api/conversations/${selectedId}`, {
      method: 'PATCH',
      body: { aiEnabled: newState },
    })
  }

  function handleSelect(id: string) {
    setSelectedId(id)
    setNewMessages([])
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6 bg-background">
      {/* Conversation List */}
      <ConversationList
        selectedId={selectedId}
        onSelect={handleSelect}
        refreshKey={refreshKey}
      />

      {/* Message Area */}
      {selectedId ? (
        <div className="flex-1 flex flex-col">
          {/* Thread Header */}
          <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-card/30">
            <div className="text-sm font-medium text-foreground">Conversation</div>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors"
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <MessageThread
            conversationId={selectedId}
            newMessages={newMessages}
          />

          {/* Input */}
          <MessageInput
            conversationId={selectedId}
            aiEnabled={aiEnabled}
            onSend={handleSend}
            onToggleAI={handleToggleAI}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground">Select a conversation</h3>
            <p className="text-xs text-muted-foreground mt-1">Choose from the list to start chatting</p>
          </div>
        </div>
      )}

      {/* Contact Sidebar */}
      {selectedId && showSidebar && (
        <ContactSidebar
          conversationId={selectedId}
          onClose={() => setShowSidebar(false)}
        />
      )}
    </div>
  )
}
