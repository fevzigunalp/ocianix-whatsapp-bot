'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { FileText, Plus } from 'lucide-react'

interface FAQ {
  id: string
  question: string
  answer: string
  category: string | null
  isActive: boolean
  usageCount: number
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ question: '', answer: '', category: '' })

  useEffect(() => {
    apiFetch<{ faqs: FAQ[] }>('/api/knowledge/faq')
      .then(data => setFaqs(data.faqs))
      .finally(() => setLoading(false))
  }, [])

  async function addFAQ() {
    if (!form.question || !form.answer) return
    await apiFetch('/api/knowledge/faq', { method: 'POST', body: form })
    setShowAdd(false)
    setForm({ question: '', answer: '', category: '' })
    const data = await apiFetch<{ faqs: FAQ[] }>('/api/knowledge/faq')
    setFaqs(data.faqs)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">FAQ Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">{faqs.length} FAQ pairs</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80">
          <Plus className="w-4 h-4" /> Add FAQ
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Question</label>
            <input value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="Soru..." className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Answer</label>
            <textarea value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} rows={3} placeholder="Cevap..." className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
            <button onClick={addFAQ} className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {faqs.map(faq => (
          <div key={faq.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Q: {faq.question}</p>
                <p className="text-sm text-muted-foreground mt-1">A: {faq.answer}</p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 ml-4">{faq.usageCount} uses</span>
            </div>
          </div>
        ))}
        {!loading && faqs.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No FAQs yet</div>
        )}
      </div>
    </div>
  )
}
