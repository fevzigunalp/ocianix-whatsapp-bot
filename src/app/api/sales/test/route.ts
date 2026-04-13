/**
 * POST /api/sales/test
 *
 * Pure sales-flow probe. No AI call, no DB write. Stateless: caller
 * passes the previous SalesFlow state, gets back the next state + the
 * guidance block that would be injected into the real prompt.
 *
 * Request:
 *   { message: string, state?: SalesFlow }
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       signal: { type, matched? },
 *       prev: SalesFlow,
 *       next: SalesFlow,
 *       missingFields: string[],
 *       leadEligible: boolean,
 *       guidance: string | null,     // what the AI would be told to ask
 *       leadParamsIfReady: object | null
 *     }
 *   }
 */

import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import {
  INITIAL_SALES_FLOW,
  classifySignal,
  advanceState,
  buildSalesGuidance,
  isReadyForLead,
  buildLeadParams,
  computeMissingFields,
  type SalesFlow,
  type SalesSignal,
} from '@/lib/ai/sales/sales-engine'

function sanitizeState(raw: unknown): SalesFlow {
  if (!raw || typeof raw !== 'object') return { ...INITIAL_SALES_FLOW }
  const s = raw as Partial<SalesFlow>
  return {
    stage: (s.stage as SalesFlow['stage']) || 'idle',
    categoryId: s.categoryId ?? null,
    offerId: s.offerId ?? null,
    collected: s.collected && typeof s.collected === 'object' ? s.collected : {},
    askedFor: Array.isArray(s.askedFor) ? s.askedFor : [],
    lastAskedFor: (s.lastAskedFor as SalesFlow['lastAskedFor']) ?? null,
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date(0).toISOString(),
  }
}

function serializeSignal(sig: SalesSignal) {
  return {
    type: sig.type,
    matchedCategory: sig.matchedCategory ? { id: sig.matchedCategory.id, label: sig.matchedCategory.label } : null,
    matchedOffer: sig.matchedOffer
      ? {
          categoryId: sig.matchedOffer.category.id,
          offerId: sig.matchedOffer.offer.id,
          label: sig.matchedOffer.offer.label,
        }
      : null,
    extracted: sig.extracted ?? null,
  }
}

export const POST = withAuth(async (req) => {
  const body = await parseBody<{ message: string; state?: unknown; contactName?: string | null }>(req)
  if (!body?.message || typeof body.message !== 'string' || !body.message.trim()) {
    return apiError('message required')
  }

  const prev = sanitizeState(body.state)
  const signal = classifySignal(body.message, prev)
  const next = advanceState(prev, signal)
  const missingFields = computeMissingFields(next)
  const leadEligible = isReadyForLead(next)
  const guidance = buildSalesGuidance(next)
  const leadParamsIfReady = leadEligible
    ? buildLeadParams(next, body.contactName ?? null)
    : null

  return apiSuccess({
    signal: serializeSignal(signal),
    prev,
    next,
    missingFields,
    leadEligible,
    guidance,
    leadParamsIfReady,
  })
})
