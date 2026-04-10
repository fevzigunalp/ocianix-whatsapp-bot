import { db } from '@/lib/db'
import { withAuth, apiSuccess } from '@/lib/api/middleware'

export const GET = withAuth(async (req, { tenantId }) => {
  const pipeline = await db.pipeline.findFirst({
    where: { tenantId, isDefault: true },
    include: {
      stages: {
        orderBy: { position: 'asc' },
        include: {
          deals: {
            where: { status: 'open' },
            orderBy: { createdAt: 'desc' },
            include: {
              contact: { select: { id: true, name: true, phone: true } },
            },
          },
          _count: { select: { deals: { where: { status: 'open' } } } },
        },
      },
    },
  })

  return apiSuccess({ pipeline })
})
