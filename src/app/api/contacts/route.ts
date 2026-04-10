import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseQuery, parseBody } from '@/lib/api/middleware'

export const GET = withAuth(async (req, { tenantId }) => {
  const query = parseQuery(req)
  const { page, limit, skip } = query.getPage()
  const search = query.getString('search')
  const tag = query.getString('tag')

  const where: any = { tenantId }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (tag) where.tags = { has: tag }

  const [contacts, total] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      skip,
      take: limit,
      include: {
        _count: { select: { conversations: true, deals: true } },
      },
    }),
    db.contact.count({ where }),
  ])

  return apiSuccess({ contacts, total, page, limit })
})

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    phone: string
    name?: string
    email?: string
    tags?: string[]
  }>(req)

  if (!body?.phone) return apiError('Phone required')

  const contact = await db.contact.create({
    data: {
      tenantId,
      phone: body.phone,
      name: body.name,
      email: body.email,
      tags: body.tags || [],
    },
  })

  return apiSuccess({ contact }, 201)
})
