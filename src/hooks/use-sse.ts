'use client'

import { useEffect, useRef, useCallback } from 'react'

type SSEHandler = (data: any) => void

export function useSSE(handlers: Record<string, SSEHandler>) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource('/api/sse')
    eventSourceRef.current = es

    es.addEventListener('message', (e) => {
      handlersRef.current.message?.(JSON.parse(e.data))
    })

    es.addEventListener('conversation_update', (e) => {
      handlersRef.current.conversation_update?.(JSON.parse(e.data))
    })

    es.addEventListener('status_update', (e) => {
      handlersRef.current.status_update?.(JSON.parse(e.data))
    })

    es.addEventListener('notification', (e) => {
      handlersRef.current.notification?.(JSON.parse(e.data))
    })

    es.addEventListener('connected', (e) => {
      handlersRef.current.connected?.(JSON.parse(e.data))
    })

    es.onerror = () => {
      es.close()
      // Reconnect after 3 seconds
      setTimeout(connect, 3000)
    }

    return es
  }, [])

  useEffect(() => {
    const es = connect()
    return () => {
      es?.close()
    }
  }, [connect])
}
