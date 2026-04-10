'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { TrendingUp, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Deal {
  id: string
  title: string
  value: number
  currency: string
  status: string
  contact: { id: string; name: string | null; phone: string }
}

interface Stage {
  id: string
  name: string
  color: string
  position: number
  deals: Deal[]
  _count: { deals: number }
}

interface Pipeline {
  id: string
  name: string
  stages: Stage[]
}

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null)

  useEffect(() => {
    loadPipeline()
  }, [])

  async function loadPipeline() {
    try {
      const data = await apiFetch<{ pipeline: Pipeline }>('/api/pipeline')
      setPipeline(data.pipeline)
    } catch (e) {
      console.error('Failed to load pipeline:', e)
    } finally {
      setLoading(false)
    }
  }

  async function moveDeal(dealId: string, newStageId: string) {
    try {
      await apiFetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        body: { stageId: newStageId },
      })
      loadPipeline()
    } catch (e) {
      console.error('Failed to move deal:', e)
    }
  }

  function handleDragStart(dealId: string) {
    setDraggedDeal(dealId)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(stageId: string) {
    if (draggedDeal) {
      moveDeal(draggedDeal, stageId)
      setDraggedDeal(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!pipeline) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No pipeline configured
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-1">{pipeline.name}</p>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {pipeline.stages.map((stage) => {
          const stageValue = stage.deals.reduce((s, d) => s + Number(d.value), 0)

          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-[280px]"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold text-foreground">{stage.name}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {stage._count.deals}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {stageValue.toLocaleString()} TRY
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[200px] bg-muted/20 rounded-xl p-2 border border-border/50">
                {stage.deals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => handleDragStart(deal.id)}
                    className={cn(
                      'bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors',
                      draggedDeal === deal.id && 'opacity-50'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <h3 className="text-sm font-medium text-foreground">{deal.title}</h3>
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {deal.contact.name || deal.contact.phone}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-medium text-foreground">
                        {Number(deal.value).toLocaleString()} {deal.currency}
                      </span>
                    </div>
                  </div>
                ))}

                {stage.deals.length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Drop deals here
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
