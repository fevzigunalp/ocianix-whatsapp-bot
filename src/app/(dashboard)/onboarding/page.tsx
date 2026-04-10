'use client'

import { useState } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { cn } from '@/lib/utils'
import { INDUSTRY_TEMPLATES } from '@/lib/ai/defaults/industry-templates'
import { ArrowRight, ArrowLeft, Check, Globe, Mic, BookOpen, TestTube, Rocket, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

const STEPS = [
  { id: 1, label: 'Basics', icon: Globe },
  { id: 2, label: 'Tone', icon: Mic },
  { id: 3, label: 'Knowledge', icon: BookOpen },
  { id: 4, label: 'Test', icon: TestTube },
  { id: 5, label: 'Go Live', icon: Rocket },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [form, setForm] = useState({
    businessName: '',
    industry: 'real_estate',
    websiteUrl: '',
    whatsappNumber: '',
    tonePreset: 'professional',
    formality: 'siz',
    faqs: [] as Array<{ question: string; answer: string }>,
  })
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' })

  const template = INDUSTRY_TEMPLATES[form.industry]

  function addFaq() {
    if (!newFaq.question || !newFaq.answer) return
    setForm(prev => ({ ...prev, faqs: [...prev.faqs, newFaq] }))
    setNewFaq({ question: '', answer: '' })
  }

  function addSuggestedFaqs() {
    if (template?.suggestedFAQs) {
      setForm(prev => ({
        ...prev,
        faqs: [...prev.faqs, ...template.suggestedFAQs.filter(s => !prev.faqs.some(f => f.question === s.question))],
      }))
    }
  }

  async function handleComplete() {
    setLoading(true)
    try {
      const data = await apiFetch('/api/onboarding', {
        method: 'POST',
        body: form,
      })
      setResult(data)
      setStep(5)
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">New Client Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">Set up a new client in minutes</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <button
              onClick={() => s.id < step && setStep(s.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                step === s.id
                  ? 'bg-primary text-white'
                  : step > s.id
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              {step > s.id ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
              {s.label}
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn('w-8 h-px mx-1', step > s.id ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="bg-card border border-border rounded-2xl p-8">
        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-foreground">İşletme Bilgileri</h2>
              <p className="text-sm text-muted-foreground">İşletmenizin temel bilgilerini girin</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">İşletme Adı</label>
              <input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="Firma adınız" className="w-full h-11 px-4 bg-muted/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Sektör</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(INDUSTRY_TEMPLATES).map(t => (
                  <button key={t.industry} onClick={() => setForm({ ...form, industry: t.industry, tonePreset: t.tone.preset, formality: t.tone.formality })}
                    className={cn('p-3 rounded-xl border text-left transition-colors', form.industry === t.industry ? 'bg-primary/10 border-primary/30' : 'border-border hover:border-primary/20')}>
                    <span className="text-sm font-medium text-foreground">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Website</label>
              <input value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://www.example.com" className="w-full h-11 px-4 bg-muted/50 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
        )}

        {/* Step 2: Tone */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-foreground">Bot Tonu</h2>
              <p className="text-sm text-muted-foreground">AI asistanınızın iletişim tarzını belirleyin</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">Ton</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: 'friendly', l: 'Samimi', d: 'Sıcak ve konuşkan' },
                  { v: 'professional', l: 'Profesyonel', d: 'Kibar ve iş odaklı' },
                  { v: 'luxury', l: 'Lüks', d: 'Zarif ve özenli' },
                  { v: 'sales', l: 'Satış', d: 'Enerjik ve ikna edici' },
                ].map(t => (
                  <button key={t.v} onClick={() => setForm({ ...form, tonePreset: t.v })}
                    className={cn('p-3 rounded-xl border text-left transition-colors', form.tonePreset === t.v ? 'bg-primary/10 border-primary/30' : 'border-border')}>
                    <span className="text-sm font-medium text-foreground">{t.l}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{t.d}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Hitap</label>
              <div className="flex gap-2">
                {[{ v: 'sen', l: 'Sen (samimi)' }, { v: 'siz', l: 'Siz (resmi)' }].map(f => (
                  <button key={f.v} onClick={() => setForm({ ...form, formality: f.v })} className={cn(
                    'flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors',
                    form.formality === f.v ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground'
                  )}>{f.l}</button>
                ))}
              </div>
            </div>
            {template && (
              <div className="bg-muted/30 rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-2">Sektör şablonundan yüklenecek:</p>
                <p className="text-xs text-foreground">{template.policies.length} policy, {template.pipeline.length} pipeline aşaması, {template.suggestedFAQs.length} FAQ önerisi</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Knowledge / FAQs */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-foreground">Bilgi Tabanı</h2>
              <p className="text-sm text-muted-foreground">Sık sorulan soruları ekleyin</p>
            </div>

            {template?.suggestedFAQs && template.suggestedFAQs.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <p className="text-xs text-primary font-medium mb-2">
                  {template.label} sektörü için önerilen {template.suggestedFAQs.length} FAQ:
                </p>
                <div className="space-y-1.5 mb-3">
                  {template.suggestedFAQs.map((faq, i) => (
                    <p key={i} className="text-xs text-foreground">• {faq.question}</p>
                  ))}
                </div>
                <button onClick={addSuggestedFaqs} className="text-xs font-medium text-primary hover:underline">
                  + Tümünü Ekle
                </button>
              </div>
            )}

            {/* Existing FAQs */}
            {form.faqs.length > 0 && (
              <div className="space-y-2">
                {form.faqs.map((faq, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">Q: {faq.question}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">A: {faq.answer}</p>
                    </div>
                    <button onClick={() => setForm(prev => ({ ...prev, faqs: prev.faqs.filter((_, j) => j !== i) }))} className="p-1 text-muted-foreground hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add FAQ */}
            <div className="space-y-2 bg-muted/20 rounded-xl p-4">
              <input value={newFaq.question} onChange={e => setNewFaq({ ...newFaq, question: e.target.value })} placeholder="Soru..." className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              <textarea value={newFaq.answer} onChange={e => setNewFaq({ ...newFaq, answer: e.target.value })} rows={2} placeholder="Cevap..." className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={addFaq} disabled={!newFaq.question || !newFaq.answer} className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium disabled:opacity-30">
                <Plus className="w-3 h-3" /> Ekle
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Test (triggers creation) */}
        {step === 4 && (
          <div className="text-center space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Hazır!</h2>
              <p className="text-sm text-muted-foreground mt-1">Ayarları uygula ve client pack'i oluştur</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-6 text-left space-y-2">
              <p className="text-sm text-foreground"><strong>İşletme:</strong> {form.businessName}</p>
              <p className="text-sm text-foreground"><strong>Sektör:</strong> {template?.label || form.industry}</p>
              <p className="text-sm text-foreground"><strong>Ton:</strong> {form.tonePreset} / {form.formality}</p>
              <p className="text-sm text-foreground"><strong>FAQ:</strong> {form.faqs.length} adet</p>
              <p className="text-sm text-foreground"><strong>Policies:</strong> {template?.policies.length || 0} adet (sektör şablonu)</p>
              <p className="text-sm text-foreground"><strong>Pipeline:</strong> {template?.pipeline.join(' → ') || 'Default'}</p>
            </div>
            <button
              onClick={handleComplete}
              disabled={loading}
              className="px-8 py-3 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur ve Aktif Et'}
            </button>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 5 && result && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Tamamlandı!</h2>
              <p className="text-sm text-muted-foreground mt-1">Client pack aktif, hazırsınız.</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 text-left space-y-1">
              <p className="text-xs text-muted-foreground">{result.policiesCreated} policy oluşturuldu</p>
              <p className="text-xs text-muted-foreground">{result.actionsEnabled} action aktif edildi</p>
              <p className="text-xs text-muted-foreground">{result.faqsCreated} FAQ eklendi</p>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={() => router.push('/ai/pack')} className="px-4 py-2 bg-muted text-foreground rounded-xl text-sm font-medium hover:bg-muted/80">
                Pack Ayarları
              </button>
              <button onClick={() => router.push('/whatsapp')} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80">
                WhatsApp Bağla
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {step < 4 && (
        <div className="flex items-center justify-between">
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ArrowLeft className="w-4 h-4" /> Geri
          </button>
          <button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !form.businessName}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80 disabled:opacity-30">
            İleri <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
