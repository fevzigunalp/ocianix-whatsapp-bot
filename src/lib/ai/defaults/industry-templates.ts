export interface IndustryTemplate {
  industry: string
  label: string
  tone: {
    preset: string
    formality: string
    emoji: boolean
  }
  policies: Array<{
    type: string
    rule: string
    keywords?: string[]
    priority?: number
    category?: string
  }>
  actions: string[]
  pipeline: string[]
  pipelineColors: string[]
  escalation: {
    maxFails: number
    confidenceThreshold: number
  }
  suggestedFAQs: Array<{ question: string; answer: string }>
}

export const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
  real_estate: {
    industry: 'real_estate',
    label: 'Emlak',
    tone: { preset: 'professional', formality: 'siz', emoji: false },
    policies: [
      { type: 'collect', rule: 'Fiyat bilgisi paylaşmadan önce isim ve telefon numarası topla', keywords: ['fiyat', 'ücret', 'ne kadar', 'kaç para'], priority: 80, category: 'pricing' },
      { type: 'refuse', rule: 'Kesin teslim tarihi sözü verme', keywords: ['teslim', 'ne zaman', 'tarih'], priority: 70, category: 'legal' },
      { type: 'escalate', rule: 'Bütçe 5M TRY üstündeyse insan temsilciye aktar', keywords: ['5 milyon', '5m', '10 milyon'], priority: 90, category: 'pricing' },
    ],
    actions: ['create_lead', 'handoff', 'send_file'],
    pipeline: ['Yeni', 'İlk Temas', 'Gezi', 'Teklif', 'Kapanış'],
    pipelineColors: ['#6366f1', '#3b82f6', '#f59e0b', '#ef4444', '#22c55e'],
    escalation: { maxFails: 2, confidenceThreshold: 60 },
    suggestedFAQs: [
      { question: 'Teslim tarihi nedir?', answer: 'Projemiz 2025 Q4 itibariyle teslim planlanmaktadır. Detaylı bilgi için temsilcimize bağlanabilirsiniz.' },
      { question: 'Peşin fiyat nedir?', answer: 'Peşin ödemelerde özel indirim uygulanmaktadır. Güncel fiyat listesi için bilgilerinizi paylaşır mısınız?' },
      { question: 'Kredi imkanı var mı?', answer: 'Evet, anlaşmalı bankalarımız üzerinden uygun kredi seçenekleri sunulmaktadır.' },
    ],
  },

  ecommerce: {
    industry: 'ecommerce',
    label: 'E-Ticaret',
    tone: { preset: 'friendly', formality: 'sen', emoji: true },
    policies: [
      { type: 'inform', rule: '500 TRY üstü siparişlerde ücretsiz kargo olduğunu her zaman belirt', keywords: ['kargo', 'gönderim', 'teslimat'], priority: 60, category: 'general' },
      { type: 'collect', rule: 'Sipariş durumu sorgulamadan önce sipariş numarası iste', keywords: ['sipariş', 'kargom', 'nerede'], priority: 80, category: 'general' },
    ],
    actions: ['create_lead', 'handoff', 'add_tag'],
    pipeline: ['Yeni', 'İlgileniyor', 'Sepet', 'Satış', 'İade'],
    pipelineColors: ['#6366f1', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444'],
    escalation: { maxFails: 3, confidenceThreshold: 50 },
    suggestedFAQs: [
      { question: 'Kargo ücreti ne kadar?', answer: '500 TRY üstü siparişlerde kargo ücretsiz! Altındaki siparişlerde 49.90 TRY kargo ücreti uygulanır.' },
      { question: 'İade nasıl yapılır?', answer: '14 gün içinde iade edebilirsin. Ürün kullanılmamış ve orijinal ambalajında olmalı.' },
      { question: 'Ne zaman gelir?', answer: 'Siparişler genellikle 2-3 iş günü içinde teslim edilir.' },
    ],
  },

  healthcare: {
    industry: 'healthcare',
    label: 'Sağlık',
    tone: { preset: 'professional', formality: 'siz', emoji: false },
    policies: [
      { type: 'refuse', rule: 'Asla tıbbi teşhis veya tedavi tavsiyesi verme', keywords: ['teşhis', 'tedavi', 'ilaç', 'hastalık', 'reçete'], priority: 99, category: 'legal' },
      { type: 'inform', rule: 'Tıbbi sorularda her zaman doktora danışmayı öner', keywords: ['ağrı', 'şikayet', 'belirti', 'semptom'], priority: 90, category: 'legal' },
      { type: 'collect', rule: 'Randevu talebi için isim ve telefon numarası topla', keywords: ['randevu', 'appointment', 'görüşme'], priority: 80, category: 'general' },
    ],
    actions: ['create_lead', 'handoff', 'create_task'],
    pipeline: ['Yeni Hasta', 'İlk Görüşme', 'Randevu', 'Takip'],
    pipelineColors: ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b'],
    escalation: { maxFails: 1, confidenceThreshold: 70 },
    suggestedFAQs: [
      { question: 'Randevu nasıl alabilirim?', answer: 'Randevu almak için isim ve telefon numaranızı paylaşmanız yeterli. Size en uygun saati belirleyelim.' },
      { question: 'Çalışma saatleri nedir?', answer: 'Hafta içi 09:00-18:00, Cumartesi 09:00-14:00 saatleri arasında hizmet vermekteyiz.' },
    ],
  },

  education: {
    industry: 'education',
    label: 'Eğitim',
    tone: { preset: 'friendly', formality: 'sen', emoji: true },
    policies: [
      { type: 'collect', rule: 'Kurs önerisi öncesi öğrenci adı ve seviyesini öğren', keywords: ['kurs', 'eğitim', 'ders', 'program'], priority: 70, category: 'general' },
    ],
    actions: ['create_lead', 'handoff'],
    pipeline: ['Yeni', 'Bilgi Aldı', 'Demo', 'Kayıt'],
    pipelineColors: ['#6366f1', '#3b82f6', '#f59e0b', '#22c55e'],
    escalation: { maxFails: 3, confidenceThreshold: 45 },
    suggestedFAQs: [
      { question: 'Kurs ücretleri ne kadar?', answer: 'Kurs ücretlerimiz seviyeye göre değişmektedir. Sana uygun programı belirleyebilmemiz için seviyeni öğrenebilir miyim?' },
      { question: 'Online ders var mı?', answer: 'Evet! Hem yüz yüze hem de online derslerimiz mevcut.' },
    ],
  },

  hospitality: {
    industry: 'hospitality',
    label: 'Otelcilik',
    tone: { preset: 'luxury', formality: 'siz', emoji: false },
    policies: [
      { type: 'collect', rule: 'Rezervasyon sorgularında tarih ve misafir sayısı topla', keywords: ['rezervasyon', 'booking', 'oda', 'konaklama'], priority: 80, category: 'general' },
      { type: 'inform', rule: 'İptal politikasını her zaman belirt', keywords: ['iptal', 'değişiklik', 'cancellation'], priority: 60, category: 'legal' },
    ],
    actions: ['create_lead', 'handoff', 'send_file'],
    pipeline: ['Talep', 'Teklif', 'Onay', 'Check-in'],
    pipelineColors: ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b'],
    escalation: { maxFails: 2, confidenceThreshold: 55 },
    suggestedFAQs: [
      { question: 'Oda fiyatları ne kadar?', answer: 'Oda fiyatlarımız sezon ve oda tipine göre değişmektedir. Tarih ve misafir sayınızı paylaşır mısınız?' },
      { question: 'İptal koşulları nedir?', answer: '48 saat öncesine kadar ücretsiz iptal imkanı sunulmaktadır. Sonrasında ilk gece ücreti tahsil edilir.' },
    ],
  },
}

export function getIndustryTemplate(industry: string): IndustryTemplate | null {
  return INDUSTRY_TEMPLATES[industry] || null
}

export function getIndustryList(): Array<{ value: string; label: string }> {
  return Object.values(INDUSTRY_TEMPLATES).map(t => ({ value: t.industry, label: t.label }))
}
