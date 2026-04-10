import { db } from '@/lib/db'

interface RetrievedChunk {
  id: string
  content: string
  category: string | null
  trustLevel: string
  isExpired: boolean
  pageUrl: string | null
  pageTitle: string | null
  lastIndexedAt: Date
  source: {
    refreshIntervalHours: number
    sourceName: string
    sourceType: string
  }
  cosineSimilarity: number
}

interface RankedChunk extends RetrievedChunk {
  finalScore: number
}

/**
 * Knowledge Engine — Retrieval with trust & freshness scoring
 */
export async function retrieveKnowledge(
  query: string,
  tenantId: string,
  topK: number = 5
): Promise<RankedChunk[]> {
  // In production, this would use pgvector similarity search:
  // SELECT *, 1 - (embedding <=> $queryEmbedding) as cosine_similarity
  // FROM knowledge_chunks WHERE tenant_id = $tenantId AND NOT is_expired
  // ORDER BY embedding <=> $queryEmbedding LIMIT 20

  // For now, use text-based search as fallback until embeddings are set up
  const chunks = await db.knowledgeChunk.findMany({
    where: {
      tenantId,
      isExpired: false,
      content: { contains: query.split(' ')[0], mode: 'insensitive' },
    },
    take: 20,
    include: {
      source: {
        select: { refreshIntervalHours: true, sourceName: true, sourceType: true },
      },
    },
  })

  // Also check FAQ pairs (highest priority)
  const faqs = await db.faqPair.findMany({
    where: {
      tenantId,
      isActive: true,
      question: { contains: query.split(' ')[0], mode: 'insensitive' },
    },
    take: 5,
  })

  // Convert FAQs to chunk format
  const faqChunks: RetrievedChunk[] = faqs.map(faq => ({
    id: faq.id,
    content: `Q: ${faq.question}\nA: ${faq.answer}`,
    category: 'faq',
    trustLevel: 'verified',
    isExpired: false,
    pageUrl: null,
    pageTitle: faq.question,
    lastIndexedAt: faq.updatedAt,
    source: { refreshIntervalHours: 999, sourceName: 'FAQ', sourceType: 'manual' },
    cosineSimilarity: 0.9, // FAQ gets high base score
  }))

  const allChunks: RetrievedChunk[] = [
    ...faqChunks,
    ...chunks.map(c => ({
      id: c.id,
      content: c.content,
      category: c.category,
      trustLevel: c.trustLevel,
      isExpired: c.isExpired,
      pageUrl: c.pageUrl,
      pageTitle: c.pageTitle,
      lastIndexedAt: c.lastIndexedAt,
      source: c.source,
      cosineSimilarity: 0.7, // Placeholder until vector search
    })),
  ]

  return rankChunks(allChunks).slice(0, topK)
}

/**
 * Trust & Freshness scoring per v5 architecture
 */
function rankChunks(chunks: RetrievedChunk[]): RankedChunk[] {
  return chunks
    .map(chunk => {
      let score = chunk.cosineSimilarity // base: 0.0 - 1.0

      // Trust boost
      if (chunk.trustLevel === 'verified') score *= 1.25
      if (chunk.trustLevel === 'provisional') score *= 0.80

      // Freshness penalty
      const daysSinceIndexed = daysBetween(chunk.lastIndexedAt, new Date())
      const refreshDays = chunk.source.refreshIntervalHours / 24
      if (daysSinceIndexed > refreshDays * 2) score *= 0.60 // very stale
      else if (daysSinceIndexed > refreshDays) score *= 0.85 // mildly stale

      // Source type boost
      if (chunk.category === 'faq') score *= 1.30
      if (chunk.category === 'pricing') score *= 1.15

      // Expiration kill
      if (chunk.isExpired) score = 0

      return { ...chunk, finalScore: score }
    })
    .filter(c => c.finalScore > 0)
    .sort((a, b) => b.finalScore - a.finalScore)
}

function daysBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24))
}
