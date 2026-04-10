'use client'

import { useState, useCallback } from 'react'

interface ApiOptions {
  method?: string
  body?: any
}

export function useApi() {
  const [loading, setLoading] = useState(false)

  const request = useCallback(async <T = any>(url: string, options?: ApiOptions): Promise<T> => {
    setLoading(true)
    try {
      const res = await fetch(url, {
        method: options?.method || 'GET',
        headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'API error')
      return json.data as T
    } finally {
      setLoading(false)
    }
  }, [])

  return { request, loading }
}

export async function apiFetch<T = any>(url: string, options?: ApiOptions): Promise<T> {
  const res = await fetch(url, {
    method: options?.method || 'GET',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'API error')
  return json.data as T
}
