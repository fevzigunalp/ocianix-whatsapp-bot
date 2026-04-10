import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody, parseQuery } from '@/lib/api/middleware'

export const GET = withAuth(async (req, { tenantId }) => {
  const query = parseQuery(req)
  const { page, limit, skip } = query.getPage()
  const status = query.getString('status')
  const priority = query.getString('priority')

  const where: any = { tenantId }
  if (status) where.status = status
  if (priority) where.priority = priority

  const [tasks, total] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      skip,
      take: limit,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
      },
    }),
    db.task.count({ where }),
  ])

  return apiSuccess({ tasks, total, page, limit })
})

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    title: string
    description?: string
    contactId?: string
    priority?: string
    dueAt?: string
  }>(req)

  if (!body?.title) return apiError('Title required')

  const task = await db.task.create({
    data: {
      tenantId,
      title: body.title,
      description: body.description,
      contactId: body.contactId,
      priority: body.priority || 'medium',
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
    },
  })

  return apiSuccess({ task }, 201)
})
