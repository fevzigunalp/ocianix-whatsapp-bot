import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { embedChunk } from '@/lib/ai/embedding'

export const GET = withAuth(async (req, { tenantId }) => {
  const url = new URL(req.url)
  const sourceId = url.searchParams.get('sourceId') || undefined
  const chunks = await db.knowledgeChunk.findMany({
    where: { tenantId, ...(sourceId ? { sourceId } : {}) },
    orderBy: { lastIndexedAt: 'desc' },
    take: 200,
    include: {
      source: { select: { id: true, sourceName: true, sourceType: true, trustLevel: true } },
    },
  })
  return apiSuccess({ chunks })
})

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    content: string
    category?: string
    pageTitle?: string
    pageUrl?: string
    sourceId?: string
    trustLevel?: string
  }>(req)
  if (!body?.content?.trim()) return apiError('content required')

  const sourceId = body.sourceId || (await ensureManualSource(tenantId))

  const chunk = await db.knowledgeChunk.create({
    data: {
      tenantId,
      sourceId,
      content: body.content.trim(),
      category: body.category,
      pageTitle: body.pageTitle,
      pageUrl: body.pageUrl,
      trustLevel: body.trustLevel || 'standard',
      lastIndexedAt: new Date(),
    },
  })

  await db.knowledgeSource.update({
    where: { id: sourceId },
    data: { chunkCount: { increment: 1 }, lastIndexedAt: new Date() },
  }).catch(() => {})

  embedChunk(chunk.id, chunk.content).catch(err =>
    console.error('[Chunk] embedding failed:', err.message)
  )

  return apiSuccess({ chunk }, 201)
})

/**
 * Lazily create a per-tenant "Manual" source so ad-hoc chunks don't require
 * the user to set up a source first. Crawler-backed sources still pass their
 * own sourceId explicitly.
 */
async function ensureManualSource(tenantId: string): Promise<string> {
  const existing = await db.knowledgeSource.findFirst({
    where: { tenantId, sourceType: 'manual', sourceName: 'Manual entries' },
  })
  if (existing) return existing.id
  const created = await db.knowledgeSource.create({
    data: {
      tenantId,
      sourceName: 'Manual entries',
      sourceType: 'manual',
      status: 'indexed',
      trustLevel: 'verified',
      autoRefresh: false,
    },
  })
  return created.id
}
