import { db } from '@/lib/db'
import { ensureVectorSchema, generateEmbedding, toPgVector, isEmbeddingEnabled } from '../embedding'

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

export interface RankedChunk extends RetrievedChunk {
  finalScore: number
}

// Minimum cosine similarity for a vector match to survive.
// Below this the retrieval returns empty, letting the prompt's
// strict-grounding fallback take over.
const VECTOR_MIN_SIMILARITY = 0.70

// How much more aggressively we cut FAQ vs. chunk results —
// FAQs are curated so we trust lower thresholds slightly less.
const VECTOR_FETCH_LIMIT = 20

export type RetrievalType = 'vector' | 'text' | 'none'

export interface RetrievalMeta {
  type: RetrievalType
  scores: number[] // cosine similarities (0..1) of returned snippets in order
}

/**
 * Knowledge Engine — vector-first retrieval with graceful text fallback.
 * Returns ranked snippets; attach .__meta for callers that want to log.
 */
export async function retrieveKnowledge(
  query: string,
  tenantId: string,
  topK: number = 5,
): Promise<RankedChunk[]> {
  const { chunks, meta } = await retrieveKnowledgeWithMeta(query, tenantId, topK)
  ;(chunks as any).__meta = meta
  return chunks
}

export async function retrieveKnowledgeWithMeta(
  query: string,
  tenantId: string,
  topK: number = 5,
): Promise<{ chunks: RankedChunk[]; meta: RetrievalMeta }> {
  const trimmed = query.trim()
  if (!trimmed) return { chunks: [], meta: { type: 'none', scores: [] } }

  // Try vector path first.
  if (isEmbeddingEnabled()) {
    const vec = await generateEmbedding(trimmed)
    if (vec) {
      await ensureVectorSchema()
      const lit = toPgVector(vec)

      let faqRows: any[] = []
      let chunkRows: any[] = []
      try {
        faqRows = await db.$queryRawUnsafe(
          `SELECT id::text AS id, question, answer, updated_at AS "updatedAt",
                  1 - (question_embedding <=> $1::vector) AS similarity
           FROM faq_pairs
           WHERE tenant_id = $2::uuid
             AND is_active = true
             AND question_embedding IS NOT NULL
           ORDER BY question_embedding <=> $1::vector
           LIMIT $3`,
          lit, tenantId, VECTOR_FETCH_LIMIT,
        )
        chunkRows = await db.$queryRawUnsafe(
          `SELECT c.id::text AS id, c.content, c.category, c.trust_level AS "trustLevel",
                  c.is_expired AS "isExpired", c.page_url AS "pageUrl",
                  c.page_title AS "pageTitle", c.last_indexed_at AS "lastIndexedAt",
                  s.refresh_interval_hours AS "refreshIntervalHours",
                  s.source_name AS "sourceName", s.source_type AS "sourceType",
                  1 - (c.content_embedding <=> $1::vector) AS similarity
           FROM knowledge_chunks c
           JOIN knowledge_sources s ON s.id = c.source_id
           WHERE c.tenant_id = $2::uuid
             AND c.is_expired = false
             AND c.content_embedding IS NOT NULL
           ORDER BY c.content_embedding <=> $1::vector
           LIMIT $3`,
          lit, tenantId, VECTOR_FETCH_LIMIT,
        )
      } catch (err: any) {
        console.error('[Knowledge] Vector query failed, falling back to text:', err.message)
        return textFallback(trimmed, tenantId, topK)
      }

      const faqChunks: RetrievedChunk[] = faqRows
        .filter(r => Number(r.similarity) >= VECTOR_MIN_SIMILARITY)
        .map(r => ({
          id: r.id,
          content: `Q: ${r.question}\nA: ${r.answer}`,
          category: 'faq',
          trustLevel: 'verified',
          isExpired: false,
          pageUrl: null,
          pageTitle: r.question,
          lastIndexedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
          source: { refreshIntervalHours: 999, sourceName: 'FAQ', sourceType: 'manual' },
          cosineSimilarity: Number(r.similarity),
        }))

      const docChunks: RetrievedChunk[] = chunkRows
        .filter(r => Number(r.similarity) >= VECTOR_MIN_SIMILARITY)
        .map(r => ({
          id: r.id,
          content: r.content,
          category: r.category,
          trustLevel: r.trustLevel,
          isExpired: r.isExpired,
          pageUrl: r.pageUrl,
          pageTitle: r.pageTitle,
          lastIndexedAt: r.lastIndexedAt ? new Date(r.lastIndexedAt) : new Date(),
          source: {
            refreshIntervalHours: Number(r.refreshIntervalHours) || 168,
            sourceName: r.sourceName || '',
            sourceType: r.sourceType || '',
          },
          cosineSimilarity: Number(r.similarity),
        }))

      const ranked = rankChunks([...faqChunks, ...docChunks]).slice(0, topK)
      return {
        chunks: ranked,
        meta: { type: 'vector', scores: ranked.map(c => Number(c.cosineSimilarity.toFixed(4))) },
      }
    }
  }

  // No API key or embedding failed → legacy text search.
  return textFallback(trimmed, tenantId, topK)
}

// ─── Legacy text fallback (kept so the platform still works without OPENAI_API_KEY) ─

async function textFallback(
  query: string,
  tenantId: string,
  topK: number,
): Promise<{ chunks: RankedChunk[]; meta: RetrievalMeta }> {
  const firstWord = query.split(/\s+/)[0] || query
  const chunks = await db.knowledgeChunk.findMany({
    where: {
      tenantId,
      isExpired: false,
      content: { contains: firstWord, mode: 'insensitive' },
    },
    take: 20,
    include: { source: { select: { refreshIntervalHours: true, sourceName: true, sourceType: true } } },
  })
  const faqs = await db.faqPair.findMany({
    where: { tenantId, isActive: true, question: { contains: firstWord, mode: 'insensitive' } },
    take: 5,
  })

  const faqChunks: RetrievedChunk[] = faqs.map(f => ({
    id: f.id,
    content: `Q: ${f.question}\nA: ${f.answer}`,
    category: 'faq',
    trustLevel: 'verified',
    isExpired: false,
    pageUrl: null,
    pageTitle: f.question,
    lastIndexedAt: f.updatedAt,
    source: { refreshIntervalHours: 999, sourceName: 'FAQ', sourceType: 'manual' },
    cosineSimilarity: 0.9,
  }))
  const docChunks: RetrievedChunk[] = chunks.map(c => ({
    id: c.id,
    content: c.content,
    category: c.category,
    trustLevel: c.trustLevel,
    isExpired: c.isExpired,
    pageUrl: c.pageUrl,
    pageTitle: c.pageTitle,
    lastIndexedAt: c.lastIndexedAt,
    source: c.source,
    cosineSimilarity: 0.7,
  }))

  const ranked = rankChunks([...faqChunks, ...docChunks]).slice(0, topK)
  return {
    chunks: ranked,
    meta: {
      type: ranked.length > 0 ? 'text' : 'none',
      scores: ranked.map(c => Number(c.cosineSimilarity.toFixed(4))),
    },
  }
}

/** Trust & Freshness scoring per v5 architecture */
function rankChunks(chunks: RetrievedChunk[]): RankedChunk[] {
  return chunks
    .map(chunk => {
      let score = chunk.cosineSimilarity

      if (chunk.trustLevel === 'verified') score *= 1.25
      if (chunk.trustLevel === 'provisional') score *= 0.80

      const daysSinceIndexed = daysBetween(chunk.lastIndexedAt, new Date())
      const refreshDays = chunk.source.refreshIntervalHours / 24
      if (daysSinceIndexed > refreshDays * 2) score *= 0.60
      else if (daysSinceIndexed > refreshDays) score *= 0.85

      if (chunk.category === 'faq') score *= 1.30
      if (chunk.category === 'pricing') score *= 1.15

      if (chunk.isExpired) score = 0

      return { ...chunk, finalScore: score }
    })
    .filter(c => c.finalScore > 0)
    .sort((a, b) => b.finalScore - a.finalScore)
}

function daysBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24))
}
