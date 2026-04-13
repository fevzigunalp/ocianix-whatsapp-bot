/**
 * POST /api/sales/commit
 *
 * Takes a completed SalesFlow (stage === 'lead_ready') and actually
 * persists a lead via the real Action Engine (create_lead). Creates
 * a disposable test Contact + Conversation if none supplied, so you
 * can drive the flow from /sales-test without wiring WhatsApp first.
 *
 * Request:
 *   { state: SalesFlow, contactName?, contactPhone?, conversationId?, contactId? }
 *
 * Response:
 *   { success: true, data: { actionStatus, deal, actionLogId, contactId, conversationId } }
 */

import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { db } from '@/lib/db'
import {
  buildLeadParams,
  isReadyForLead,
  type SalesFlow,
} from '@/lib/ai/sales/sales-engine'
import {
  executeAction,
  ensureDefaultActions,
} from '@/lib/ai/engines/action-engine'

function sanitizeState(raw: unknown): SalesFlow | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<SalesFlow>
  if (!s.stage) return null
  return {
    stage: s.stage as SalesFlow['stage'],
    categoryId: s.categoryId ?? null,
    offerId: s.offerId ?? null,
    collected: s.collected && typeof s.collected === 'object' ? s.collected : {},
    askedFor: Array.isArray(s.askedFor) ? s.askedFor : [],
    lastAskedFor: (s.lastAskedFor as SalesFlow['lastAskedFor']) ?? null,
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
  }
}

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    state: unknown
    contactName?: string
    contactPhone?: string
    conversationId?: string
    contactId?: string
  }>(req)

  const state = sanitizeState(body?.state)
  if (!state) return apiError('valid state required')
  if (!isReadyForLead(state)) {
    return apiError('state.stage must be lead_ready before commit', 400)
  }

  // Ensure built-in actions (create_lead, handoff, request_date) exist for this tenant
  await ensureDefaultActions(tenantId)

  // Resolve or create a test contact
  let contactId = body?.contactId
  if (!contactId) {
    const phone = body?.contactPhone || `test-${Date.now()}`
    const name = body?.contactName || (state.collected.name as string | undefined) || 'Sales Test Contact'
    const existing = await db.contact.findFirst({ where: { tenantId, phone } })
    if (existing) {
      contactId = existing.id
    } else {
      const created = await db.contact.create({
        data: { tenantId, name, phone, tags: ['sales-test'] },
      })
      contactId = created.id
    }
  }

  // Resolve or create a test conversation
  let conversationId = body?.conversationId
  if (!conversationId) {
    const convo = await db.conversation.create({
      data: {
        tenantId,
        contactId,
        status: 'open',
        handlerType: 'ai',
        aiEnabled: true,
      },
    })
    conversationId = convo.id
  }

  // Fire create_lead via the real action engine
  const leadParams = buildLeadParams(state, body?.contactName || (state.collected.name as string | undefined) || null)
  const result = await executeAction('create_lead', leadParams, {
    tenantId,
    conversationId,
    contactId,
  })

  // Surface the freshest action log + deal (if action succeeded)
  let actionLogId: string | null = null
  let deal: any = null
  if (result.status === 'success') {
    const log = await db.actionLog.findFirst({
      where: { tenantId, conversationId, contactId, status: 'success' },
      orderBy: { createdAt: 'desc' },
    })
    actionLogId = log?.id ?? null

    const dealId = (result.data as any)?.deal_id
    if (dealId) {
      deal = await db.deal.findUnique({
        where: { id: dealId },
        include: { stage: { select: { name: true, position: true } } },
      })
    }
  }

  return apiSuccess({
    actionStatus: result.status,
    actionError: result.error ?? null,
    contactId,
    conversationId,
    actionLogId,
    deal,
    leadParams,
  })
})
