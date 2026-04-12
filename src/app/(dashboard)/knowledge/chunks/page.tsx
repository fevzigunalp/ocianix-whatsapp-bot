'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

interface Chunk {
  id: string
  content: string
  category: string | null
  pageTitle: string | null
  pageUrl: string | null
  trustLevel: string
  isExpired: boolean
  lastIndexedAt: string
  source: { id: string; sourceName: string; sourceType: string; trustLevel: string } | null
}

const EMPTY = { content: '', category: '', pageTitle: '', pageUrl: '' }

export default function ChunksPage() {
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY)

  async function refresh() {
    const data = await apiFetch<{ chunks: Chunk[] }>('/api/knowledge/chunks')
    setChunks(data.chunks)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function addChunk() {
    if (!form.content.trim()) return
    await apiFetch('/api/knowledge/chunks', { method: 'POST', body: form })
    setShowAdd(false)
    setForm(EMPTY)
    refresh()
  }

  function startEdit(c: Chunk) {
    setEditId(c.id)
    setEditForm({
      content: c.content,
      category: c.category || '',
      pageTitle: c.pageTitle || '',
      pageUrl: c.pageUrl || '',
    })
  }

  async function saveEdit() {
    if (!editId) return
    await apiFetch(`/api/knowledge/chunks/${editId}`, { method: 'PATCH', body: editForm })
    setEditId(null)
    refresh()
  }

  async function deleteChunk(id: string) {
    if (!confirm('Bu chunk silinsin mi?')) return
    await apiFetch(`/api/knowledge/chunks/${id}`, { method: 'DELETE' })
    refresh()
  }

  async function backfill() {
    const r = await apiFetch<{ embedded: number }>('/api/knowledge/embed', { method: 'POST' })
    alert(`${r.embedded} embedding oluşturuldu`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge Chunks</h1>
          <p className="text-sm text-muted-foreground mt-1">{chunks.length} chunks · otomatik embedding</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={backfill} className="px-3 py-2 text-xs text-muted-foreground border border-border rounded-lg hover:bg-muted/50">
            Re-embed missing
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80">
            <Plus className="w-4 h-4" /> Add Chunk
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-3">
          <Fields form={form} setForm={setForm} />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowAdd(false); setForm(EMPTY) }} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
            <button onClick={addChunk} className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {chunks.map(c => (
          <div key={c.id} className="bg-card border border-border rounded-xl p-4">
            {editId === c.id ? (
              <div className="space-y-3">
                <Fields form={editForm} setForm={setEditForm} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-sm text-muted-foreground flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
                  <button onClick={saveEdit} className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium">Save</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {c.pageTitle && <p className="text-sm font-medium text-foreground">{c.pageTitle}</p>}
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">{c.content}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {c.category && <span className="px-2 py-0.5 text-[10px] bg-muted rounded">{c.category}</span>}
                    <span className="px-2 py-0.5 text-[10px] bg-muted rounded">trust: {c.trustLevel}</span>
                    {c.source && <span className="text-[10px] text-muted-foreground">from: {c.source.sourceName}</span>}
                    {c.isExpired && <span className="text-[10px] text-destructive">expired</span>}
                    {c.pageUrl && <a href={c.pageUrl} target="_blank" className="text-[10px] text-primary underline truncate">{c.pageUrl}</a>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEdit(c)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Düzenle">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteChunk(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Sil">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && chunks.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No chunks yet</div>
        )}
      </div>
    </div>
  )
}

function Fields({ form, setForm }: { form: typeof EMPTY; setForm: (f: typeof EMPTY) => void }) {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Content *</label>
        <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={5} placeholder="Bilgi metni..." className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
          <input value={form.pageTitle} onChange={e => setForm({ ...form, pageTitle: e.target.value })} className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
          <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="pricing, product..." className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Page URL (optional, for crawler phase)</label>
        <input value={form.pageUrl} onChange={e => setForm({ ...form, pageUrl: e.target.value })} placeholder="https://..." className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
    </>
  )
}
