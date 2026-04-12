import { db } from '@/lib/db'
import { evolutionAPI, publicWebhookUrl } from '@/lib/evolution'
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

  // Register the webhook so Evolution knows where to deliver events.
  // Non-fatal — if it fails we still return the instance; /sync can retry.
  const webhookUrl = publicWebhookUrl()
  if (webhookUrl) {
    try {
      await evolutionAPI.setWebhook(body.instanceName, webhookUrl)
      console.log('[WA] Webhook registered:', webhookUrl)
    } catch (err: any) {
      console.error('[WA] setWebhook failed:', err.message)
    }
  } else {
    console.warn('[WA] PUBLIC_WEBHOOK_URL / NEXT_PUBLIC_APP_URL not set — skipping setWebhook')
  }

  // Save to DB
  const instance = await db.whatsappInstance.create({
    data: {
      tenantId,
      instanceName: body.instanceName,
      instanceId: result?.instance?.instanceId || null,
      phoneNumber: body.phoneNumber,
      status: 'connecting',
      webhookUrl,
    },
  })

  return apiSuccess({ instance, qrcode: result?.qrcode }, 201)
})
