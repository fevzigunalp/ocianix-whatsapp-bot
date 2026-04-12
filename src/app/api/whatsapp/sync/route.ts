import { db } from '@/lib/db'
import { evolutionAPI, publicWebhookUrl } from '@/lib/evolution'
import { withAuth, apiSuccess, apiError } from '@/lib/api/middleware'

/**
 * POST /api/whatsapp/sync
 * Pull instance status from Evolution API and update platform DB
 */
export const POST = withAuth(async (req, { tenantId }) => {
  try {
    // Fetch all instances from Evolution API
    const evoInstances = await evolutionAPI.listInstances()
    console.log('[Sync] Evolution instances:', evoInstances.map(i => `${i.instanceName}=${i.status}`).join(', '))

    // Get platform instances for this tenant
    const dbInstances = await db.whatsappInstance.findMany({
      where: { tenantId },
    })

    const results: any[] = []

    for (const dbInst of dbInstances) {
      const evoInst = evoInstances.find(e => e.instanceName === dbInst.instanceName)

      if (evoInst) {
        // Sync status, phone, profileName
        const phone = evoInst.owner?.replace('@s.whatsapp.net', '') || dbInst.phoneNumber
        const updated = await db.whatsappInstance.update({
          where: { id: dbInst.id },
          data: {
            instanceId: evoInst.instanceId || dbInst.instanceId,
            status: evoInst.status,
            phoneNumber: phone,
            lastConnectedAt: evoInst.status === 'connected' ? new Date() : dbInst.lastConnectedAt,
          },
        })
        // Re-apply webhook so Evolution always points at our current public URL
        const hook = publicWebhookUrl()
        let webhookSet = false
        if (hook) {
          try {
            await evolutionAPI.setWebhook(updated.instanceName, hook)
            webhookSet = true
            if (updated.webhookUrl !== hook) {
              await db.whatsappInstance.update({ where: { id: updated.id }, data: { webhookUrl: hook } })
            }
          } catch (err: any) {
            console.error('[Sync] setWebhook failed for', updated.instanceName, err.message)
          }
        }
        results.push({ name: updated.instanceName, status: updated.status, phone: updated.phoneNumber, synced: true, webhookSet })
      } else {
        // Instance exists in DB but not in Evolution — mark disconnected
        await db.whatsappInstance.update({
          where: { id: dbInst.id },
          data: { status: 'disconnected' },
        })
        results.push({ name: dbInst.instanceName, status: 'disconnected', synced: false, reason: 'not found in Evolution' })
      }
    }

    return apiSuccess({ instances: results })
  } catch (error: any) {
    console.error('[Sync] Error:', error.message)
    return apiError(`Sync failed: ${error.message}`, 500)
  }
})
