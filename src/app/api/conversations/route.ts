import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseQuery } from '@/lib/api/middleware'

// GET /api/conversations — list conversations
export const GET = withAuth(async (req, { tenantId }) => {
  const query = parseQuery(req)
  const { page, limit, skip } = query.getPage()
  const status = query.getString('status')
  const search = query.getString('search')
  const handler = query.getString('handler')

  const where: any = { tenantId }
  if (status) where.status = status
  if (handler) where.handlerType = handler
  if (search) {
    where.contact = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ],
    }
  }

  const [conversations, total] = await Promise.all([
    db.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: limit,
      include: {
        contact: {
          select: { id: true, name: true, phone: true, avatarUrl: true, tags: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, contentType: true, sender: true, createdAt: true },
        },
        agent: {
          select: { id: true, name: true },
        },
      },
    }),
    db.conversation.count({ where }),
  ])

  return apiSuccess({ conversations, total, page, limit })
})
