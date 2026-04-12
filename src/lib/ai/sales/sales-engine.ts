/**
 * Sales flow state machine (Phase 3.0).
 *
 * Stateless functions that read the current sales state (stored in
 * conversation.metadata.salesFlow), look at the latest inbound message,
 * and decide:
 *   - what state to move to,
 *   - what guidance to inject into the system prompt,
 *   - whether it's time to trigger the create_lead action.
 *
 * The flow runs IN ADDITION to normal RAG + faithfulness. If a message
 * is a knowledge question, we leave the sales state as-is and let RAG
 * answer — sales guidance is appended only when there is something
 * actionable to suggest.
 */

import {
  SALES_CATALOG,
  findCategory,
  findOffer,
  foldTr,
  type DetailField,
  type SalesCategory,
  type SalesOffer,
} from './catalog'

export type SalesStage =
  | 'idle'
  | 'category_selected'
  | 'offer_selected'
  | 'collecting_details'
  | 'lead_ready'

export interface SalesFlow {
  stage: SalesStage
  categoryId: string | null
  offerId: string | null
  collected: Partial<Record<DetailField, string | number>>
  askedFor: DetailField[] // fields we already asked about (to avoid re-asking same turn)
  updatedAt: string // ISO
}

export const INITIAL_SALES_FLOW: SalesFlow = {
  stage: 'idle',
  categoryId: null,
  offerId: null,
  collected: {},
  askedFor: [],
  updatedAt: new Date(0).toISOString(),
}

export type SignalType =
  | 'discovery'        // user asked "what do you offer?"
  | 'category_pick'    // user picked a top category (from previous options)
  | 'direct_offer'     // user named a specific offer/service directly
  | 'detail_answer'    // user is replying with a date/number/etc
  | 'knowledge'        // a normal Q&A / RAG question — keep sales state
  | 'unclear'

export interface SalesSignal {
  type: SignalType
  matchedCategory?: SalesCategory | null
  matchedOffer?: { category: SalesCategory; offer: SalesOffer } | null
  extracted?: Partial<Record<DetailField, string | number>>
}

const DISCOVERY_PATTERNS = [
  /hizmet/, /neler yap/, /ne yap[ıi]yor/, /paket/, /\bne var\b/,
  /\bneler var\b/, /opsiyon/, /menu/, /\bmenü/, /\bservis/,
  /what do you offer/, /services/,
]

// Messages that usually mean "I want a number" or picking an option by index
const ORDINAL_RE = /(?:^|\s)([1-9])[).\s]/

/** Figure out what the user just did. */
export function classifySignal(message: string, current: SalesFlow): SalesSignal {
  const raw = message.trim()
  if (!raw) return { type: 'unclear' }
  const m = foldTr(raw)

  // 1) Direct offer match — strongest signal (also wins over ordinals)
  for (const cat of SALES_CATALOG) {
    for (const off of cat.offers) {
      for (const alias of off.aliases) {
        if (m.includes(foldTr(alias))) {
          return { type: 'direct_offer', matchedOffer: { category: cat, offer: off } }
        }
      }
    }
  }

  // 2) If we're offering choices (category_selected), try ordinal or alias pick
  if (current.stage === 'idle') {
    const ord = m.match(ORDINAL_RE)
    if (ord) {
      const idx = parseInt(ord[1], 10) - 1
      if (idx >= 0 && idx < SALES_CATALOG.length) {
        return { type: 'category_pick', matchedCategory: SALES_CATALOG[idx] }
      }
    }
    for (const cat of SALES_CATALOG) {
      for (const alias of cat.aliases) {
        if (m.includes(foldTr(alias))) return { type: 'category_pick', matchedCategory: cat }
      }
    }
  }

  if (current.stage === 'category_selected' && current.categoryId) {
    const cat = findCategory(current.categoryId)
    if (cat) {
      const ord = m.match(ORDINAL_RE)
      if (ord) {
        const idx = parseInt(ord[1], 10) - 1
        if (idx >= 0 && idx < cat.offers.length) {
          return { type: 'direct_offer', matchedOffer: { category: cat, offer: cat.offers[idx] } }
        }
      }
    }
  }

  // 3) Detail answer — only meaningful mid-collection
  if (current.stage === 'offer_selected' || current.stage === 'collecting_details') {
    const extracted = extractDetails(raw, current)
    if (Object.keys(extracted).length > 0) {
      return { type: 'detail_answer', extracted }
    }
  }

  // 4) Discovery intent
  if (DISCOVERY_PATTERNS.some(re => re.test(m))) return { type: 'discovery' }

  // 5) Everything else → let RAG handle it, don't touch sales state
  return { type: 'knowledge' }
}

/** Cheap extractors for the few fields we care about. */
export function extractDetails(message: string, current: SalesFlow): Partial<Record<DetailField, string | number>> {
  const out: Partial<Record<DetailField, string | number>> = {}
  const m = message.toLowerCase()

  // Date: dd.mm[.yyyy] or dd/mm[/yyyy] or dd MMM (Turkish month)
  const dm =
    m.match(/\b(\d{1,2}[.\/\-]\d{1,2}(?:[.\/\-]\d{2,4})?)\b/) ||
    m.match(/\b(\d{1,2}\s+(?:ocak|subat|şubat|mart|nisan|mayis|mayıs|haziran|temmuz|agustos|ağustos|eylul|eylül|ekim|kasim|kasım|aralik|aralık)(?:\s+\d{4})?)\b/)
  if (dm && !current.collected.date) out.date = dm[1].trim()

  // Guests / participants: "5 kişi", "iki kişi", "biz 2 kişiyiz"
  const WORD_NUM: Record<string, number> = {
    'bir': 1, 'iki': 2, 'uc': 3, 'üç': 3, 'dort': 4, 'dört': 4,
    'bes': 5, 'beş': 5, 'alti': 6, 'altı': 6, 'yedi': 7, 'sekiz': 8,
    'dokuz': 9, 'on': 10,
  }
  const numericGuests = m.match(/(\d{1,3})\s*(?:kisi|kişi|misafir|guest|pax|kişilik|kisilik)\b/)
  const wordGuests = m.match(/\b(bir|iki|uc|üç|dort|dört|bes|beş|alti|altı|yedi|sekiz|dokuz|on)\s*(?:kisi|kişi|misafir)\b/)
  const count = numericGuests ? Number(numericGuests[1]) : wordGuests ? WORD_NUM[wordGuests[1]] : null
  if (count !== null && !Number.isNaN(count)) {
    // route into whichever field the current offer wants
    const offer = findOffer(current.categoryId, current.offerId)
    const field: DetailField = offer?.required.includes('guests')
      ? 'guests'
      : offer?.required.includes('participants')
        ? 'participants'
        : 'guests'
    if (!current.collected[field]) out[field] = count
  }

  return out
}

/** Given a signal, produce the next state. Pure — doesn't write anywhere. */
export function advanceState(current: SalesFlow, signal: SalesSignal): SalesFlow {
  const now = new Date().toISOString()

  switch (signal.type) {
    case 'discovery':
      return { ...INITIAL_SALES_FLOW, stage: 'idle', updatedAt: now }

    case 'category_pick': {
      if (!signal.matchedCategory) return current
      return {
        ...current,
        stage: 'category_selected',
        categoryId: signal.matchedCategory.id,
        offerId: null,
        updatedAt: now,
      }
    }

    case 'direct_offer': {
      if (!signal.matchedOffer) return current
      return {
        stage: 'offer_selected',
        categoryId: signal.matchedOffer.category.id,
        offerId: signal.matchedOffer.offer.id,
        collected: {},
        askedFor: [],
        updatedAt: now,
      }
    }

    case 'detail_answer': {
      const merged = { ...current.collected, ...(signal.extracted || {}) }
      const offer = findOffer(current.categoryId, current.offerId)
      const required = offer?.required || []
      const allCollected = required.every(f => merged[f] !== undefined && merged[f] !== '')
      return {
        ...current,
        stage: allCollected ? 'lead_ready' : 'collecting_details',
        collected: merged,
        updatedAt: now,
      }
    }

    case 'knowledge':
    case 'unclear':
    default:
      return current
  }
}

export function isReadyForLead(state: SalesFlow): boolean {
  return state.stage === 'lead_ready'
}

/** What to pass as action params when firing create_lead. */
export function buildLeadParams(state: SalesFlow, contactName: string | null): Record<string, any> {
  const cat = findCategory(state.categoryId)
  const offer = findOffer(state.categoryId, state.offerId)
  const title = offer
    ? `${offer.label} — ${contactName || 'Yeni lead'}`
    : cat
      ? `${cat.label} ilgisi — ${contactName || 'Yeni lead'}`
      : `Yeni lead — ${contactName || ''}`.trim()

  return {
    title,
    category: cat?.id || null,
    subcategory: offer?.id || null,
    date: state.collected.date ?? null,
    guests: state.collected.guests ?? null,
    participants: state.collected.participants ?? null,
    notes: summarizeState(state),
  }
}

function summarizeState(state: SalesFlow): string {
  const cat = findCategory(state.categoryId)
  const offer = findOffer(state.categoryId, state.offerId)
  const parts: string[] = []
  if (cat) parts.push(`Kategori: ${cat.label}`)
  if (offer) parts.push(`Hizmet: ${offer.label}`)
  if (state.collected.date) parts.push(`Tarih: ${state.collected.date}`)
  if (state.collected.guests) parts.push(`Kişi: ${state.collected.guests}`)
  if (state.collected.participants) parts.push(`Katılımcı: ${state.collected.participants}`)
  return parts.join(' · ')
}

/**
 * System-prompt guidance: tells the AI what the sales flow expects
 * next, without putting words in its mouth. The AI still writes the
 * reply — the guidance just gives it structure.
 */
export function buildSalesGuidance(state: SalesFlow): string | null {
  const cat = findCategory(state.categoryId)
  const offer = findOffer(state.categoryId, state.offerId)

  if (state.stage === 'idle') {
    const opts = SALES_CATALOG.map((c, i) => `${i + 1}. ${c.label}`).join('\n')
    return `SALES MODE — DISCOVERY
The customer has not yet chosen a service area. Offer a short, friendly lead-in and then present EXACTLY these top-level options as a numbered list (so they can reply with a number or name):
${opts}
Do not dump a long paragraph. One sentence of framing, then the list, then stop. Keep confidence moderate.`
  }

  if (state.stage === 'category_selected' && cat) {
    const opts = cat.offers.map((o, i) => `${i + 1}. ${o.label}`).join('\n')
    return `SALES MODE — ${cat.label.toUpperCase()} SUBCATEGORIES
The customer picked "${cat.label}". Briefly acknowledge and present these sub-options as a numbered list, then ask which one interests them:
${opts}
Keep it concise. One line of framing, then the list.`
  }

  if (state.stage === 'offer_selected' && offer) {
    const firstMissing = offer.required.find(f => state.collected[f] === undefined)
    const question = firstMissing ? detailQuestion(firstMissing) : 'Başka bir tercihiniz var mı?'
    return `SALES MODE — ${offer.label.toUpperCase()} DETAILS
The customer is interested in "${offer.label}". Give a SHORT (1–2 sentence) description using only KNOWN FACTS if available, then ask ONE next question to collect info: ${question}
If you do not have a factual description, skip it and go straight to the question.`
  }

  if (state.stage === 'collecting_details' && offer) {
    const missing = offer.required.filter(f => state.collected[f] === undefined)
    if (missing.length === 0) return null
    const question = detailQuestion(missing[0])
    const collectedStr = Object.entries(state.collected)
      .map(([k, v]) => `${k}=${v}`).join(', ')
    return `SALES MODE — STILL COLLECTING (${offer.label})
So far collected: ${collectedStr || '(nothing)'}. Ask ONE short question to collect the next missing field: ${question}
Acknowledge what they just told you in 3–5 words before asking.`
  }

  if (state.stage === 'lead_ready' && offer) {
    return `SALES MODE — LEAD READY (${offer.label})
All required details collected (${summarizeState(state)}). Confirm briefly in one sentence that you've noted their request and tell them a team member will follow up with availability and pricing. Do NOT invent prices or promise exact times.`
  }

  return null
}

function detailQuestion(field: DetailField): string {
  switch (field) {
    case 'date': return 'Hangi tarih için düşünüyorsunuz?'
    case 'guests': return 'Toplam kaç kişi olacaksınız?'
    case 'participants': return 'Çekime/aktiviteye kaç kişi katılacak?'
    case 'time': return 'Günün hangi saati sizin için uygun?'
    case 'location': return 'Nerede yapmak istersiniz?'
    case 'extras': return 'Eklemek istediğiniz özel bir tercih var mı?'
  }
}
