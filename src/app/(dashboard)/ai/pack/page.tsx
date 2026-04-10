'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { Bot, Save, Rocket, Globe, Mic, BookOpen, Shield, Zap, TestTube } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'identity', label: 'Identity', icon: Globe },
  { id: 'tone', label: 'Tone', icon: Mic },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'policies', label: 'Policies', icon: Shield },
  { id: 'actions', label: 'Actions', icon: Zap },
  { id: 'test', label: 'Test & Publish', icon: TestTube },
]

const INDUSTRIES = [
  { value: 'real_estate', label: 'Emlak' },
  { value: 'ecommerce', label: 'E-Ticaret' },
  { value: 'healthcare', label: 'Sağlık' },
  { value: 'education', label: 'Eğitim' },
  { value: 'hospitality', label: 'Otelcilik' },
  { value: 'technology', label: 'Teknoloji' },
  { value: 'other', label: 'Diğer' },
]

const TONES = [
  { value: 'friendly', label: 'Friendly', desc: 'Warm and conversational' },
  { value: 'professional', label: 'Professional', desc: 'Polite and business-like' },
  { value: 'luxury', label: 'Luxury', desc: 'Elegant and refined' },
  { value: 'sales', label: 'Sales', desc: 'Enthusiastic and persuasive' },
]

interface PackForm {
  businessName: string
  websiteUrl: string
  industry: string
  configTier: string
  tonePreset: string
  formality: string
  useEmoji: boolean
  maxResponseLen: number
  customInstructions: string
  confidenceThreshold: number
  maxFails: number
}

export default function ClientPackPage() {
  const [tab, setTab] = useState('identity')
  const [form, setForm] = useState<PackForm>({
    businessName: '',
    websiteUrl: '',
    industry: 'technology',
    configTier: 'advanced',
    tonePreset: 'professional',
    formality: 'siz',
    useEmoji: false,
    maxResponseLen: 4,
    customInstructions: '',
    confidenceThreshold: 60,
    maxFails: 2,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activePack, setActivePack] = useState<any>(null)

  useEffect(() => {
    loadPack()
  }, [])

  async function loadPack() {
    try {
      const data = await apiFetch<{ packs: any[] }>('/api/client-packs')
      const active = data.packs.find(p => p.status === 'active') || data.packs[0]
      if (active) {
        setActivePack(active)
        setForm({
          businessName: active.businessName || '',
          websiteUrl: active.websiteUrl || '',
          industry: active.industry || 'technology',
          configTier: active.configTier || 'advanced',
          tonePreset: active.tonePreset || 'professional',
          formality: active.formality || 'siz',
          useEmoji: active.useEmoji || false,
          maxResponseLen: active.maxResponseLen || 4,
          customInstructions: active.customInstructions || '',
          confidenceThreshold: active.confidenceThreshold || 60,
          maxFails: active.maxFails || 2,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await apiFetch('/api/client-packs', { method: 'POST', body: form })
      loadPack()
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!activePack) return
    await apiFetch('/api/client-packs', {
      method: 'PATCH',
      body: { packId: activePack.id, action: 'publish' },
    })
    loadPack()
  }

  function updateForm(key: keyof PackForm, value: any) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Pack Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activePack ? `v${activePack.version} — ${activePack.status}` : 'Create your first pack'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-muted text-foreground rounded-xl text-sm font-medium hover:bg-muted/80 transition-colors">
            <Save className="w-4 h-4" /> Save Draft
          </button>
          <button onClick={handlePublish} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80 transition-colors">
            <Rocket className="w-4 h-4" /> Publish
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-card border border-border rounded-xl p-6">
        {tab === 'identity' && (
          <div className="space-y-5 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Business Name</label>
              <input value={form.businessName} onChange={e => updateForm('businessName', e.target.value)} className="w-full h-10 px-4 bg-muted/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Website URL</label>
              <input value={form.websiteUrl} onChange={e => updateForm('websiteUrl', e.target.value)} placeholder="https://" className="w-full h-10 px-4 bg-muted/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Industry</label>
              <select value={form.industry} onChange={e => updateForm('industry', e.target.value)} className="w-full h-10 px-4 bg-muted/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                {INDUSTRIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Configuration Level</label>
              <div className="flex gap-2">
                {['simple', 'advanced', 'expert'].map(tier => (
                  <button key={tier} onClick={() => updateForm('configTier', tier)} className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium border transition-colors capitalize',
                    form.configTier === tier ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                  )}>{tier}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'tone' && (
          <div className="space-y-5 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">Tone Preset</label>
              <div className="grid grid-cols-2 gap-2">
                {TONES.map(t => (
                  <button key={t.value} onClick={() => updateForm('tonePreset', t.value)} className={cn(
                    'p-3 rounded-xl border text-left transition-colors',
                    form.tonePreset === t.value ? 'bg-primary/10 border-primary/30' : 'border-border hover:border-border/80'
                  )}>
                    <span className="text-sm font-medium text-foreground">{t.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Formality</label>
              <div className="flex gap-2">
                {[{ v: 'sen', l: 'Sen (informal)' }, { v: 'siz', l: 'Siz (formal)' }].map(f => (
                  <button key={f.v} onClick={() => updateForm('formality', f.v)} className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
                    form.formality === f.v ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground'
                  )}>{f.l}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Use Emoji</label>
              <button onClick={() => updateForm('useEmoji', !form.useEmoji)} className={cn(
                'w-10 h-6 rounded-full transition-colors relative',
                form.useEmoji ? 'bg-primary' : 'bg-muted'
              )}>
                <div className={cn('absolute top-1 w-4 h-4 rounded-full bg-white transition-transform', form.useEmoji ? 'left-5' : 'left-1')} />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Max Response Length ({form.maxResponseLen} sentences)</label>
              <input type="range" min={1} max={10} value={form.maxResponseLen} onChange={e => updateForm('maxResponseLen', parseInt(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Custom Instructions</label>
              <textarea value={form.customInstructions} onChange={e => updateForm('customInstructions', e.target.value)} rows={4} placeholder="Additional instructions for the AI..." className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
        )}

        {tab === 'knowledge' && (
          <div className="text-center py-12">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Manage knowledge sources from the Knowledge Base section</p>
          </div>
        )}

        {tab === 'policies' && (
          <div className="text-center py-12">
            <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Manage policies from the Policies section</p>
          </div>
        )}

        {tab === 'actions' && (
          <div className="text-center py-12">
            <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Manage actions from the Actions section</p>
          </div>
        )}

        {tab === 'test' && (
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Confidence Threshold ({form.confidenceThreshold}%)</label>
              <input type="range" min={20} max={95} value={form.confidenceThreshold} onChange={e => updateForm('confidenceThreshold', parseInt(e.target.value))} className="w-full" />
              <p className="text-xs text-muted-foreground mt-1">Below this threshold, AI will escalate to human</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Max Fails Before Escalation</label>
              <input type="number" min={1} max={5} value={form.maxFails} onChange={e => updateForm('maxFails', parseInt(e.target.value))} className="w-20 h-10 px-3 bg-muted/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
