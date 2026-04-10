import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { buildSystemPrompt } from '@/lib/ai/prompt-builder'

export const GET = withAuth(async (req, { tenantId }) => {
  const packs = await db.clientPack.findMany({
    where: { tenantId },
    orderBy: { version: 'desc' },
    include: { policies: { orderBy: { priority: 'desc' } } },
  })
  return apiSuccess({ packs })
})

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    businessName?: string
    websiteUrl?: string
    industry?: string
    configTier?: string
    tonePreset?: string
    formality?: string
    useEmoji?: boolean
    maxResponseLen?: number
    customInstructions?: string
    confidenceThreshold?: number
    maxFails?: number
  }>(req)

  if (!body) return apiError('Body required')

  // Get next version number
  const latest = await db.clientPack.findFirst({
    where: { tenantId },
    orderBy: { version: 'desc' },
  })

  const pack = await db.clientPack.create({
    data: {
      tenantId,
      version: (latest?.version || 0) + 1,
      status: 'draft',
      ...body,
    },
  })

  return apiSuccess({ pack }, 201)
})

// PATCH — publish a pack
export const PATCH = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    packId: string
    action: 'publish' | 'archive' | 'compile'
  }>(req)

  if (!body?.packId || !body?.action) return apiError('packId and action required')

  const pack = await db.clientPack.findFirst({
    where: { id: body.packId, tenantId },
    include: { policies: true },
  })
  if (!pack) return apiError('Pack not found', 404)

  if (body.action === 'publish') {
    // Archive current active pack
    await db.clientPack.updateMany({
      where: { tenantId, status: 'active' },
      data: { status: 'archived' },
    })

    // Compile prompt
    const actions = await db.actionDefinition.findMany({
      where: { tenantId, isEnabled: true },
    })
    const compiledPrompt = buildSystemPrompt(
      pack ? {
        businessName: pack.businessName, industry: pack.industry, websiteUrl: pack.websiteUrl,
        tonePreset: pack.tonePreset, formality: pack.formality, useEmoji: pack.useEmoji,
        maxResponseLen: pack.maxResponseLen, customInstructions: pack.customInstructions,
        language: pack.language,
      } : null,
      { contactName: null, contactPhone: '', recentMessages: [] }
    )

    // Publish new pack
    const updated = await db.clientPack.update({
      where: { id: body.packId },
      data: {
        status: 'active',
        publishedAt: new Date(),
        compiledPrompt,
      },
    })

    return apiSuccess({ pack: updated })
  }

  if (body.action === 'archive') {
    const updated = await db.clientPack.update({
      where: { id: body.packId },
      data: { status: 'archived' },
    })
    return apiSuccess({ pack: updated })
  }

  return apiError('Invalid action')
})
