/**
 * Sales catalog — single source of truth for categories, subcategories,
 * keyword aliases (for direct-intent detection), and the minimum detail
 * fields we need to collect before creating a lead.
 *
 * Language: Turkish (tenant default). Keep lowercase, ASCII-folded aliases.
 * Tune per tenant later by loading a tenant-specific override from the
 * ClientPack; for now this is a reasonable default for Cappadocia-style
 * event/photography businesses.
 */

export type DetailField = 'date' | 'guests' | 'participants' | 'time' | 'location' | 'extras'

export interface SalesOffer {
  id: string
  label: string
  aliases: string[]
  required: DetailField[]
  blurb?: string
}

export interface SalesCategory {
  id: string
  label: string
  aliases: string[]
  offers: SalesOffer[]
}

export const SALES_CATALOG: SalesCategory[] = [
  {
    id: 'organization',
    label: 'Organizasyonlar',
    aliases: ['organizasyon', 'organization', 'etkinlik', 'kutlama', 'özel gün', 'ozel gun'],
    offers: [
      {
        id: 'marriage_proposal',
        label: 'Evlilik Teklifi',
        aliases: ['evlilik teklifi', 'teklif', 'proposal', 'evlenme teklifi', 'surprise proposal'],
        required: ['date', 'guests'],
      },
      {
        id: 'birthday',
        label: 'Doğum Günü',
        aliases: ['dogum gunu', 'doğum günü', 'birthday', 'dogumgunu'],
        required: ['date', 'guests'],
      },
      {
        id: 'sunset_dinner',
        label: 'Gün Batımı Yemeği',
        aliases: ['gun batimi', 'gün batımı', 'sunset dinner', 'romantik yemek', 'özel yemek'],
        required: ['date', 'guests'],
      },
      {
        id: 'anniversary',
        label: 'Yıldönümü',
        aliases: ['yildonumu', 'yıldönümü', 'anniversary', 'evlilik yıldönümü'],
        required: ['date', 'guests'],
      },
    ],
  },
  {
    id: 'photography',
    label: 'Profesyonel Çekimler',
    aliases: ['cekim', 'çekim', 'fotograf', 'fotoğraf', 'foto', 'video', 'photography', 'shoot'],
    offers: [
      {
        id: 'couple_shoot',
        label: 'Çift Çekimi',
        aliases: ['cift cekimi', 'çift çekimi', 'couple shoot', 'cift foto'],
        required: ['date', 'participants'],
      },
      {
        id: 'proposal_shoot',
        label: 'Evlilik Teklifi Çekimi',
        aliases: ['teklif cekimi', 'teklif çekimi', 'proposal shoot', 'evlilik teklifi çekimi'],
        required: ['date', 'participants'],
      },
      {
        id: 'flying_dress',
        label: 'Flying Dress',
        aliases: ['flying dress', 'uçan elbise', 'ucan elbise'],
        required: ['date', 'participants'],
      },
      {
        id: 'photo_video_package',
        label: 'Video / Fotoğraf Paketleri',
        aliases: ['paket', 'video paketi', 'foto paketi', 'combo', 'video+foto'],
        required: ['date', 'participants'],
      },
    ],
  },
  {
    id: 'activities',
    label: 'Aktiviteler',
    aliases: ['aktivite', 'activity', 'deneyim', 'experience', 'tur'],
    offers: [
      {
        id: 'horse_riding',
        label: 'At Binme',
        aliases: ['at binme', 'at turu', 'horse riding', 'horse'],
        required: ['date', 'participants'],
      },
      {
        id: 'classic_car',
        label: 'Klasik Araba',
        aliases: ['klasik araba', 'classic car', 'eski araba', 'vintage car'],
        required: ['date', 'participants'],
      },
      {
        id: 'balloon_backdrop_shoot',
        label: 'Balon Manzaralı Çekim',
        aliases: ['balon manzarali', 'balon manzarası', 'balloon backdrop', 'balon çekim'],
        required: ['date', 'participants'],
      },
      {
        id: 'other_activity',
        label: 'Diğer Aktiviteler',
        aliases: ['diğer aktivite', 'diger aktivite', 'other activity'],
        required: ['date', 'participants'],
      },
    ],
  },
]

export function findCategory(id: string | null | undefined): SalesCategory | null {
  if (!id) return null
  return SALES_CATALOG.find(c => c.id === id) || null
}

export function findOffer(
  categoryId: string | null | undefined,
  offerId: string | null | undefined,
): SalesOffer | null {
  if (!categoryId || !offerId) return null
  const cat = findCategory(categoryId)
  return cat?.offers.find(o => o.id === offerId) || null
}

/** ASCII + lowercase fold so alias matching handles Turkish diacritics. */
export function foldTr(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/Ş/g, 's')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/Ü/g, 'u')
    .replace(/ö/g, 'o').replace(/Ö/g, 'o')
    .replace(/ç/g, 'c').replace(/Ç/g, 'c')
    .trim()
}
