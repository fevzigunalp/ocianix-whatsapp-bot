import { db } from '@/lib/db'
import { withAdmin, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { getIndustryTemplate } from '@/lib/ai/defaults/industry-templates'
import { slugify } from '@/lib/utils'

/**
 * POST /api/onboarding — Create a new client from onboarding wizard
 * Creates: tenant, user, pipeline, client pack, policies, actions, suggested FAQs
 */
export const POST = withAdmin(async (req, { tenantId, userId }) => {
  const body = await parseBody<{
    businessName: string
    industry: string
    websiteUrl?: string
    whatsappNumber?: string
    tonePreset?: string
    formality?: string
    faqs?: Array<{ question: string; answer: string }>
  }>(req)

  if (!body?.businessName || !body?.industry) {
    return apiError('businessName and industry required')
  }

  const template = getIndustryTemplate(body.industry)

  // 1. Create pipeline from template
  const pipelineStages = template?.pipeline || ['Yeni', 'İlk Temas', 'Teklif', 'Kapanış']
  const pipelineColors = template?.pipelineColors || ['#6366f1', '#3b82f6', '#f59e0b', '#22c55e']

  const pipeline = await db.pipeline.create({
    data: {
      tenantId,
      name: `${body.businessName} Pipeline`,
      isDefault: true,
    },
  })

  for (let i = 0; i < pipelineStages.length; i++) {
    await db.pipelineStage.create({
      data: {
        tenantId,
        pipelineId: pipeline.id,
        name: pipelineStages[i],
        color: pipelineColors[i] || '#3b82f6',
        position: i,
      },
    })
  }

  // 2. Create client pack
  const tone = template?.tone || { preset: body.tonePreset || 'professional', formality: body.formality || 'siz', emoji: false }
  const escalation = template?.escalation || { maxFails: 2, confidenceThreshold: 60 }

  const pack = await db.clientPack.create({
    data: {
      tenantId,
      version: 1,
      status: 'active',
      configTier: 'simple',
      industry: body.industry,
      businessName: body.businessName,
      websiteUrl: body.websiteUrl,
      tonePreset: tone.preset,
      formality: tone.formality,
      useEmoji: tone.emoji,
      maxResponseLen: 4,
      confidenceThreshold: escalation.confidenceThreshold,
      maxFails: escalation.maxFails,
      publishedAt: new Date(),
    },
  })

  // 3. Create policies from template
  if (template?.policies) {
    for (const policy of template.policies) {
      await db.policy.create({
        data: {
          tenantId,
          packId: pack.id,
          policyType: policy.type,
          ruleText: policy.rule,
          keywords: policy.keywords || [],
          priority: policy.priority || 50,
          category: policy.category,
        },
      })
    }
  }

  // 4. Enable default actions
  const defaultActions = template?.actions || ['create_lead', 'handoff']
  for (const actionName of defaultActions) {
    const existing = await db.actionDefinition.findFirst({
      where: { tenantId, name: actionName },
    })
    if (!existing) {
      // Create from built-in definitions
      await db.actionDefinition.create({
        data: {
          tenantId,
          name: actionName,
          displayName: actionName.replace('_', ' '),
          executionType: 'internal',
          executionConfig: { handler: actionName },
          parameterSchema: {},
        },
      })
    }
  }

  // 5. Create FAQs
  const faqs = body.faqs || template?.suggestedFAQs || []
  for (const faq of faqs) {
    await db.faqPair.create({
      data: {
        tenantId,
        question: faq.question,
        answer: faq.answer,
      },
    })
  }

  return apiSuccess({
    pipeline: pipeline.id,
    pack: pack.id,
    policiesCreated: template?.policies?.length || 0,
    actionsEnabled: defaultActions.length,
    faqsCreated: faqs.length,
  }, 201)
})
