import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'

export const GET = withAuth(async (req, { tenantId }) => {
  const actions = await db.actionDefinition.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { actionLogs: true } } },
  })
  return apiSuccess({ actions })
})

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    name: string
    displayName?: string
    description?: string
    executionType: string
    executionConfig: Record<string, any>
    parameterSchema?: Record<string, any>
  }>(req)

  if (!body?.name || !body?.executionType) return apiError('name and executionType required')

  const action = await db.actionDefinition.create({
    data: {
      tenantId,
      name: body.name,
      displayName: body.displayName,
      description: body.description,
      executionType: body.executionType,
      executionConfig: body.executionConfig || {},
      parameterSchema: body.parameterSchema || {},
    },
  })

  return apiSuccess({ action }, 201)
})
