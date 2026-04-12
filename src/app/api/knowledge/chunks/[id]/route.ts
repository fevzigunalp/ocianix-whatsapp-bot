import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { embedChunk } from '@/lib/ai/embedding'

export const PATCH = withAuth(async (req, { tenantId, params }) => {
  const id = params.id
  const body = await parseBody<{
    content?: string
    category?: string | null
    pageTitle?: string | null
    pageUrl?: string | null
    trustLevel?: string
    isExpired?: boolean
  }>(req)
  if (!body) return apiError('body required')

  const existing = await db.knowledgeChunk.findFirst({ where: { id, tenantId } })
  if (!existing) return apiError('not found', 404)

  const updated = await db.knowledgeChunk.update({
    where: { id },
    data: {
      content: body.content ?? existing.content,
      category: body.category ?? existing.category,
      pageTitle: body.pageTitle ?? existing.pageTitle,
      pageUrl: body.pageUrl ?? existing.pageUrl,
      trustLevel: body.trustLevel ?? existing.trustLevel,
      isExpired: body.isExpired ?? existing.isExpired,
      lastIndexedAt: body.content !== undefined ? new Date() : existing.lastIndexedAt,
    },
  })

  if (body.content !== undefined && body.content !== existing.content) {
    embedChunk(updated.id, updated.content).catch(err =>
      console.error('[Chunk] re-embed failed:', err.message)
    )
  }

  return apiSuccess({ chunk: updated })
})

export const DELETE = withAuth(async (_req, { tenantId, params }) => {
  const id = params.id
  const existing = await db.knowledgeChunk.findFirst({ where: { id, tenantId } })
  if (!existing) return apiError('not found', 404)
  await db.knowledgeChunk.delete({ where: { id } })
  await db.knowledgeSource.update({
    where: { id: existing.sourceId },
    data: { chunkCount: { decrement: 1 } },
  }).catch(() => {})
  return apiSuccess({ deleted: true })
})
