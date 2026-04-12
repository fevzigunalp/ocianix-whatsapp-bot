/**
 * POST /api/knowledge/embed
 * Backfills embeddings for FAQs and knowledge chunks that are missing them.
 * Idempotent: rows that already have an embedding are skipped.
 */
import { db } from '@/lib/db'
import { withAuth, apiSuccess } from '@/lib/api/middleware'
import { embedFaq, embedChunk, ensureVectorSchema, isEmbeddingEnabled } from '@/lib/ai/embedding'

export const POST = withAuth(async (_req, { tenantId }) => {
  if (!isEmbeddingEnabled()) {
    return apiSuccess({ embedded: 0, skipped: 0, reason: 'OPENAI_API_KEY not set' })
  }
  await ensureVectorSchema()

  const faqRows: Array<{ id: string; question: string; answer: string }> = await db.$queryRawUnsafe(
    `SELECT id::text AS id, question, answer
     FROM faq_pairs
     WHERE tenant_id = $1::uuid AND is_active = true AND question_embedding IS NULL
     LIMIT 200`,
    tenantId,
  )
  const chunkRows: Array<{ id: string; content: string }> = await db.$queryRawUnsafe(
    `SELECT id::text AS id, content
     FROM knowledge_chunks
     WHERE tenant_id = $1::uuid AND is_expired = false AND content_embedding IS NULL
     LIMIT 200`,
    tenantId,
  )

  let embedded = 0
  for (const r of faqRows) if (await embedFaq(r.id, r.question, r.answer)) embedded++
  for (const r of chunkRows) if (await embedChunk(r.id, r.content)) embedded++

  return apiSuccess({
    embedded,
    faqCount: faqRows.length,
    chunkCount: chunkRows.length,
  })
})
