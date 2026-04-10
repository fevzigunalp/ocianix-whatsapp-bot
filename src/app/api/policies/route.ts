import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'

export const GET = withAuth(async (req, { tenantId }) => {
  const policies = await db.policy.findMany({
    where: { tenantId },
    orderBy: { priority: 'desc' },
  })
  return apiSuccess({ policies })
})

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    policyType: string
    ruleText: string
    keywords?: string[]
    priority?: number
    category?: string
    packId?: string
  }>(req)

  if (!body?.policyType || !body?.ruleText) return apiError('policyType and ruleText required')

  const policy = await db.policy.create({
    data: {
      tenantId,
      policyType: body.policyType,
      ruleText: body.ruleText,
      keywords: body.keywords || [],
      priority: body.priority || 50,
      category: body.category,
      packId: body.packId,
    },
  })

  return apiSuccess({ policy }, 201)
})
