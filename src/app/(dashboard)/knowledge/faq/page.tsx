'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

interface FAQ {
  id: string
  question: string
  answer: string
  category: string | null
  isActive: boolean
  usageCount: number
}

const EMPTY = { question: '', answer: '', category: '' }

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY)

  async function refresh() {
    const data = await apiFetch<{ faqs: FAQ[] }>('/api/knowledge/faq')
    setFaqs(data.faqs)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function addFAQ() {
    if (!form.question || !form.answer) return
    await apiFetch('/api/knowledge/faq', { method: 'POST', body: form })
    setShowAdd(false)
    setForm(EMPTY)
    refresh()
  }

  function startEdit(f: FAQ) {
    setEditId(f.id)
    setEditForm({ question: f.question, answer: f.answer, category: f.category || '' })
  }

  async function saveEdit() {
    if (!editId) return
    await apiFetch(`/api/knowledge/faq/${editId}`, { method: 'PATCH', body: editForm })
    setEditId(null)
    refresh()
  }

  async function deleteFAQ(id: string) {
    if (!confirm('Bu FAQ silinsin mi?')) return
    await apiFetch(`/api/knowledge/faq/${id}`, { method: 'DELETE' })
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
          <h1 className="text-2xl font-bold text-foreground">FAQ Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">{faqs.length} FAQ pairs · otomatik embedding</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={backfill} className="px-3 py-2 text-xs text-muted-foreground border border-border rounded-lg hover:bg-muted/50">
            Re-embed missing
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80">
            <Plus className="w-4 h-4" /> Add FAQ
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-3">
          <FormFields form={form} setForm={setForm} />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowAdd(false); setForm(EMPTY) }} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
            <button onClick={addFAQ} className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {faqs.map(faq => (
          <div key={faq.id} className="bg-card border border-border rounded-xl p-4">
            {editId === faq.id ? (
              <div className="space-y-3">
                <FormFields form={editForm} setForm={setEditForm} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-sm text-muted-foreground flex items-center gap-1"><X className="w-3.5 h-3.5" /> Cancel</button>
                  <button onClick={saveEdit} className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium">Save</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground break-words">Q: {faq.question}</p>
                  <p className="text-sm text-muted-foreground mt-1 break-words">A: {faq.answer}</p>
                  {faq.category && <span className="inline-block mt-2 px-2 py-0.5 text-[10px] bg-muted rounded">{faq.category}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{faq.usageCount} uses</span>
                  <button onClick={() => startEdit(faq)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Düzenle">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteFAQ(faq.id)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Sil">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && faqs.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No FAQs yet</div>
        )}
      </div>
    </div>
  )
}

function FormFields({ form, setForm }: { form: typeof EMPTY; setForm: (f: typeof EMPTY) => void }) {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Question</label>
        <input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="Soru..." className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Answer</label>
        <textarea value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} rows={3} placeholder="Cevap..." className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Category (optional)</label>
        <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="pricing, product, general..." className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
    </>
  )
}
