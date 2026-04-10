'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { Shield, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const POLICY_TYPES = [
  { value: 'answer', label: 'Answer', color: 'text-green-400 bg-green-400/10', desc: 'Allow answering about topic' },
  { value: 'refuse', label: 'Refuse', color: 'text-red-400 bg-red-400/10', desc: 'Never discuss topic' },
  { value: 'collect', label: 'Collect', color: 'text-amber-400 bg-amber-400/10', desc: 'Require data before action' },
  { value: 'ask', label: 'Ask', color: 'text-blue-400 bg-blue-400/10', desc: 'Request clarification' },
  { value: 'escalate', label: 'Escalate', color: 'text-purple-400 bg-purple-400/10', desc: 'Force human handoff' },
  { value: 'inform', label: 'Inform', color: 'text-cyan-400 bg-cyan-400/10', desc: 'Always include disclaimer' },
  { value: 'restrict', label: 'Restrict', color: 'text-orange-400 bg-orange-400/10', desc: 'Limit scope of answer' },
]

interface Policy {
  id: string
  policyType: string
  ruleText: string
  keywords: string[]
  priority: number
  category: string | null
  isActive: boolean
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newPolicy, setNewPolicy] = useState({
    policyType: 'refuse',
    ruleText: '',
    keywords: '',
    priority: 50,
    category: '',
  })

  useEffect(() => { loadPolicies() }, [])

  async function loadPolicies() {
    try {
      const data = await apiFetch<{ policies: Policy[] }>('/api/policies')
      setPolicies(data.policies)
    } finally { setLoading(false) }
  }

  async function addPolicy() {
    if (!newPolicy.ruleText.trim()) return
    await apiFetch('/api/policies', {
      method: 'POST',
      body: {
        ...newPolicy,
        keywords: newPolicy.keywords.split(',').map(k => k.trim()).filter(Boolean),
      },
    })
    setShowAdd(false)
    setNewPolicy({ policyType: 'refuse', ruleText: '', keywords: '', priority: 50, category: '' })
    loadPolicies()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Policies</h1>
          <p className="text-sm text-muted-foreground mt-1">{policies.length} active policies</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80 transition-colors">
          <Plus className="w-4 h-4" /> Add Policy
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
              <select value={newPolicy.policyType} onChange={e => setNewPolicy({ ...newPolicy, policyType: e.target.value })} className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                {POLICY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Priority (0-100)</label>
              <input type="number" min={0} max={100} value={newPolicy.priority} onChange={e => setNewPolicy({ ...newPolicy, priority: parseInt(e.target.value) })} className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Rule Text</label>
            <textarea value={newPolicy.ruleText} onChange={e => setNewPolicy({ ...newPolicy, ruleText: e.target.value })} placeholder="Never discuss competitor pricing" rows={2} className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Keywords (comma separated)</label>
            <input value={newPolicy.keywords} onChange={e => setNewPolicy({ ...newPolicy, keywords: e.target.value })} placeholder="rakip, competitor, karşılaştırma" className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={addPolicy} className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/80">Save</button>
          </div>
        </div>
      )}

      {/* Policy list */}
      <div className="space-y-2">
        {policies.map(policy => {
          const type = POLICY_TYPES.find(t => t.value === policy.policyType)
          return (
            <div key={policy.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0', type?.color)}>
                {type?.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{policy.ruleText}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[10px] text-muted-foreground">Priority: {policy.priority}</span>
                  {policy.category && <span className="text-[10px] text-muted-foreground">Category: {policy.category}</span>}
                  {policy.keywords.length > 0 && (
                    <div className="flex gap-1">
                      {policy.keywords.map(kw => (
                        <span key={kw} className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {!loading && policies.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No policies configured</div>
        )}
      </div>
    </div>
  )
}
