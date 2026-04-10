import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody, parseQuery } from '@/lib/api/middleware'

export const GET = withAuth(async (req, { tenantId }) => {
  const sources = await db.knowledgeSource.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { chunks: true } } },
  })
  return apiSuccess({ sources })
})

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    sourceName: string
    sourceType: string
    sourceUrl?: string
    trustLevel?: string
  }>(req)

  if (!body?.sourceName || !body?.sourceType) return apiError('sourceName and sourceType required')

  const source = await db.knowledgeSource.create({
    data: {
      tenantId,
      sourceName: body.sourceName,
      sourceType: body.sourceType,
      sourceUrl: body.sourceUrl,
      trustLevel: body.trustLevel || 'standard',
    },
  })

  return apiSuccess({ source }, 201)
})
