'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { FolderOpen, Plus, Globe, FileText, Database, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface Source {
  id: string
  sourceName: string
  sourceType: string
  sourceUrl: string | null
  status: string
  pageCount: number
  chunkCount: number
  trustLevel: string
  lastIndexedAt: string | null
  _count: { chunks: number }
}

export default function KnowledgeSourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ sourceName: '', sourceType: 'website', sourceUrl: '' })

  useEffect(() => {
    apiFetch<{ sources: Source[] }>('/api/knowledge/sources')
      .then(data => setSources(data.sources))
      .finally(() => setLoading(false))
  }, [])

  async function addSource() {
    if (!form.sourceName) return
    await apiFetch('/api/knowledge/sources', { method: 'POST', body: form })
    setShowAdd(false)
    setForm({ sourceName: '', sourceType: 'website', sourceUrl: '' })
    const data = await apiFetch<{ sources: Source[] }>('/api/knowledge/sources')
    setSources(data.sources)
  }

  const typeIcons: Record<string, React.ReactNode> = {
    website: <Globe className="w-4 h-4 text-blue-400" />,
    file: <FileText className="w-4 h-4 text-amber-400" />,
    google_sheet: <Database className="w-4 h-4 text-green-400" />,
    manual: <FolderOpen className="w-4 h-4 text-violet-400" />,
  }

  const statusColors: Record<string, string> = {
    pending: 'text-slate-400 bg-slate-400/10',
    crawling: 'text-blue-400 bg-blue-400/10',
    indexed: 'text-green-400 bg-green-400/10',
    failed: 'text-red-400 bg-red-400/10',
    stale: 'text-amber-400 bg-amber-400/10',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Sources</h1>
          <p className="text-sm text-muted-foreground mt-1">Data sources for AI knowledge base</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80">
          <Plus className="w-4 h-4" /> Add Source
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input value={form.sourceName} onChange={e => setForm({ ...form, sourceName: e.target.value })} placeholder="Source name" className="h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <select value={form.sourceType} onChange={e => setForm({ ...form, sourceType: e.target.value })} className="h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground">
              <option value="website">Website</option>
              <option value="file">File</option>
              <option value="google_sheet">Google Sheet</option>
              <option value="manual">Manual</option>
            </select>
            <input value={form.sourceUrl} onChange={e => setForm({ ...form, sourceUrl: e.target.value })} placeholder="URL (optional)" className="h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
            <button onClick={addSource} className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium">Add</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sources.map(source => (
          <div key={source.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            {typeIcons[source.sourceType] || typeIcons.manual}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{source.sourceName}</span>
                <span className={cn('text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full', statusColors[source.status])}>
                  {source.status}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                {source.sourceUrl && <span>{source.sourceUrl}</span>}
                <span>{source._count.chunks} chunks</span>
                <span>Trust: {source.trustLevel}</span>
                {source.lastIndexedAt && <span>Indexed: {format(new Date(source.lastIndexedAt), 'dd MMM HH:mm')}</span>}
              </div>
            </div>
          </div>
        ))}
        {!loading && sources.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No knowledge sources</div>
        )}
      </div>
    </div>
  )
}
