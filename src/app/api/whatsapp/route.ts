import { db } from '@/lib/db'
import { evolutionAPI } from '@/lib/evolution'
import { withAuth, withAdmin, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'

export const GET = withAuth(async (req, { tenantId }) => {
  const instances = await db.whatsappInstance.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })
  return apiSuccess({ instances })
})

export const POST = withAdmin(async (req, { tenantId }) => {
  const body = await parseBody<{ instanceName: string; phoneNumber?: string }>(req)
  if (!body?.instanceName) return apiError('instanceName required')

  // Create in Evolution API
  const result = await evolutionAPI.createInstance(body.instanceName)

  // Save to DB
  const instance = await db.whatsappInstance.create({
    data: {
      tenantId,
      instanceName: body.instanceName,
      instanceId: result?.instance?.instanceId || null,
      phoneNumber: body.phoneNumber,
      status: 'connecting',
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/evolution`,
    },
  })

  return apiSuccess({ instance, qrcode: result?.qrcode }, 201)
})
