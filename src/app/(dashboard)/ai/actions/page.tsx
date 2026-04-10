'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { Zap, Plus, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Action {
  id: string
  name: string
  displayName: string | null
  description: string | null
  executionType: string
  isEnabled: boolean
  maxExecutionsPerHour: number
  _count: { actionLogs: number }
}

export default function ActionsPage() {
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<{ actions: Action[] }>('/api/actions')
      .then(data => setActions(data.actions))
      .finally(() => setLoading(false))
  }, [])

  const typeColors: Record<string, string> = {
    internal: 'text-emerald-400 bg-emerald-400/10',
    n8n_webhook: 'text-orange-400 bg-orange-400/10',
    external_api: 'text-blue-400 bg-blue-400/10',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Actions</h1>
          <p className="text-sm text-muted-foreground mt-1">AI can trigger these actions during conversations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map(action => (
          <div key={action.id} className="bg-card border border-border rounded-xl p-5 hover:border-border/80 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn('w-2.5 h-2.5 rounded-full', action.isEnabled ? 'bg-green-500' : 'bg-slate-500')} />
                <h3 className="text-sm font-semibold text-foreground">{action.displayName || action.name}</h3>
              </div>
              <span className={cn('text-[10px] font-medium uppercase px-2 py-0.5 rounded-full', typeColors[action.executionType])}>
                {action.executionType.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{action.description || 'No description'}</p>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{action._count.actionLogs} executions</span>
              <span>{action.maxExecutionsPerHour}/hr limit</span>
            </div>
          </div>
        ))}

        {!loading && actions.length === 0 && (
          <div className="col-span-full text-center py-12 text-sm text-muted-foreground">
            No actions configured
          </div>
        )}
      </div>
    </div>
  )
}
