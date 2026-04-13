/**
 * POST /api/sales/scenarios
 *
 * Runs a fixed suite of 10 realistic sales-flow scenarios through the
 * pure state machine (no AI, no DB). Returns PASS/FAIL per turn + an
 * overall summary. Used as the Phase 7 acceptance gate.
 *
 * Optional query `?id=<n>` to run a single scenario.
 */

import { withAuth, apiSuccess } from '@/lib/api/middleware'
import {
  INITIAL_SALES_FLOW,
  classifySignal,
  advanceState,
  isReadyForLead,
  computeMissingFields,
  type SalesFlow,
} from '@/lib/ai/sales/sales-engine'

type Expect = {
  signalType?: string
  signalOfferId?: string
  signalCategoryId?: string
  nextStage?: SalesFlow['stage']
  leadEligible?: boolean
  collectedHas?: string[]
  missingIncludes?: string[]
  // guidanceContains is a soft check on the guidance string
}

interface Turn {
  say: string
  expect: Expect
}

interface Scenario {
  id: number
  name: string
  description: string
  turns: Turn[]
}

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    name: 'Broad discovery',
    description: 'Customer asks what the business offers.',
    turns: [
      {
        say: 'Kapadokya\'daki hizmetleriniz neler?',
        expect: { signalType: 'discovery', nextStage: 'idle' },
      },
    ],
  },
  {
    id: 2,
    name: 'Direct marriage-proposal intent',
    description: 'Customer names the organization offer directly.',
    turns: [
      {
        say: 'Evlilik teklifi organizasyonu hakkında bilgi alabilir miyim?',
        expect: {
          signalType: 'direct_offer',
          signalOfferId: 'marriage_proposal',
          nextStage: 'offer_selected',
          missingIncludes: ['name', 'date', 'guests'],
        },
      },
    ],
  },
  {
    id: 3,
    name: 'Direct proposal-shoot intent (longest-alias must win)',
    description: 'Ambiguous phrase routes to photography.proposal_shoot, not organization.marriage_proposal.',
    turns: [
      {
        say: 'Evlilik teklifi çekimi yaptırmak istiyorum',
        expect: {
          signalType: 'direct_offer',
          signalOfferId: 'proposal_shoot',
          nextStage: 'offer_selected',
          missingIncludes: ['name', 'date', 'participants'],
        },
      },
    ],
  },
  {
    id: 4,
    name: 'Flying dress offer',
    description: 'Another direct offer match.',
    turns: [
      {
        say: 'Flying dress çekimi istiyorum',
        expect: {
          signalType: 'direct_offer',
          signalOfferId: 'flying_dress',
          nextStage: 'offer_selected',
        },
      },
    ],
  },
  {
    id: 5,
    name: 'Full lead collection (photography)',
    description: 'Direct offer → name → date → participants → lead_ready.',
    turns: [
      {
        say: 'evlilik teklifi çekimi',
        expect: { signalType: 'direct_offer', signalOfferId: 'proposal_shoot', nextStage: 'offer_selected' },
      },
      {
        say: 'Ayşe Yılmaz',
        expect: {
          signalType: 'detail_answer',
          nextStage: 'collecting_details',
          collectedHas: ['name'],
          missingIncludes: ['date', 'participants'],
        },
      },
      {
        say: '15 Mayıs 2026',
        expect: {
          signalType: 'detail_answer',
          nextStage: 'collecting_details',
          collectedHas: ['name', 'date'],
          missingIncludes: ['participants'],
        },
      },
      {
        say: '2 kişiyiz',
        expect: {
          signalType: 'detail_answer',
          nextStage: 'lead_ready',
          leadEligible: true,
          collectedHas: ['name', 'date', 'participants'],
        },
      },
    ],
  },
  {
    id: 6,
    name: 'Full lead collection (organization)',
    description: 'Birthday organization → guests field collected (not participants).',
    turns: [
      {
        say: 'doğum günü organizasyonu istiyorum',
        expect: { signalType: 'direct_offer', signalOfferId: 'birthday', nextStage: 'offer_selected' },
      },
      {
        say: 'Ben Kerem',
        expect: { signalType: 'detail_answer', collectedHas: ['name'] },
      },
      {
        say: '20.06.2026',
        expect: { signalType: 'detail_answer', collectedHas: ['name', 'date'] },
      },
      {
        say: '10 kişi olacağız',
        expect: {
          signalType: 'detail_answer',
          nextStage: 'lead_ready',
          leadEligible: true,
          collectedHas: ['name', 'date', 'guests'],
        },
      },
    ],
  },
  {
    id: 7,
    name: 'Knowledge question mid-flow does not break state',
    description: 'After offer selected, a payment question must leave state unchanged.',
    turns: [
      {
        say: 'çift çekimi istiyorum',
        expect: { signalType: 'direct_offer', signalOfferId: 'couple_shoot', nextStage: 'offer_selected' },
      },
      {
        say: 'Ödeme nasıl yapılıyor?',
        expect: { signalType: 'knowledge', nextStage: 'offer_selected' },
      },
    ],
  },
  {
    id: 8,
    name: 'Unclear / nonsense message',
    description: 'Gibberish must not alter state.',
    turns: [
      {
        say: 'asdqwe 12345',
        expect: { nextStage: 'idle' },
      },
    ],
  },
  {
    id: 9,
    name: 'Price question without selected offer',
    description: 'Plain price question maps to knowledge, not direct_offer.',
    turns: [
      {
        say: 'Fiyat ne kadar?',
        expect: { signalType: 'knowledge', nextStage: 'idle' },
      },
    ],
  },
  {
    id: 10,
    name: 'Discovery resets mid-conversation',
    description: 'After progress, a new discovery question returns to idle.',
    turns: [
      {
        say: 'evlilik teklifi çekimi',
        expect: { signalType: 'direct_offer', nextStage: 'offer_selected' },
      },
      {
        say: 'hizmetleriniz neler?',
        expect: { signalType: 'discovery', nextStage: 'idle' },
      },
    ],
  },
]

function checkTurn(
  state: SalesFlow,
  message: string,
  expect: Expect,
): { pass: boolean; details: any } {
  const sig = classifySignal(message, state)
  const next = advanceState(state, sig)
  const missing = computeMissingFields(next)
  const leadOK = isReadyForLead(next)

  const failures: string[] = []
  if (expect.signalType && sig.type !== expect.signalType)
    failures.push(`signalType: expected=${expect.signalType} got=${sig.type}`)
  if (expect.signalOfferId && sig.matchedOffer?.offer.id !== expect.signalOfferId)
    failures.push(`signalOfferId: expected=${expect.signalOfferId} got=${sig.matchedOffer?.offer.id ?? 'none'}`)
  if (expect.signalCategoryId && sig.matchedCategory?.id !== expect.signalCategoryId)
    failures.push(`signalCategoryId: expected=${expect.signalCategoryId} got=${sig.matchedCategory?.id ?? 'none'}`)
  if (expect.nextStage && next.stage !== expect.nextStage)
    failures.push(`nextStage: expected=${expect.nextStage} got=${next.stage}`)
  if (expect.leadEligible !== undefined && leadOK !== expect.leadEligible)
    failures.push(`leadEligible: expected=${expect.leadEligible} got=${leadOK}`)
  if (expect.collectedHas) {
    for (const k of expect.collectedHas) {
      if ((next.collected as any)[k] === undefined)
        failures.push(`collectedHas: missing "${k}"`)
    }
  }
  if (expect.missingIncludes) {
    for (const k of expect.missingIncludes) {
      if (!missing.includes(k as any))
        failures.push(`missingIncludes: expected "${k}" in missing [${missing.join(', ')}]`)
    }
  }

  return {
    pass: failures.length === 0,
    details: {
      signal: {
        type: sig.type,
        offer: sig.matchedOffer?.offer.id ?? null,
        category: sig.matchedCategory?.id ?? null,
      },
      stage: `${state.stage} → ${next.stage}`,
      collected: next.collected,
      missing,
      leadEligible: leadOK,
      failures,
      nextState: next,
    },
  }
}

export const POST = withAuth(async (req) => {
  const url = new URL(req.url)
  const idFilter = url.searchParams.get('id')

  const scenarios = idFilter
    ? SCENARIOS.filter(s => s.id === parseInt(idFilter, 10))
    : SCENARIOS

  const results = scenarios.map(sc => {
    const turnResults: any[] = []
    let state: SalesFlow = { ...INITIAL_SALES_FLOW }
    let pass = true
    for (const t of sc.turns) {
      const r = checkTurn(state, t.say, t.expect)
      turnResults.push({
        say: t.say,
        expected: t.expect,
        ...r.details,
        pass: r.pass,
      })
      if (!r.pass) pass = false
      state = r.details.nextState
      delete turnResults[turnResults.length - 1].nextState
    }
    return { id: sc.id, name: sc.name, description: sc.description, pass, turns: turnResults }
  })

  const passCount = results.filter(r => r.pass).length
  return apiSuccess({
    total: results.length,
    pass: passCount,
    fail: results.length - passCount,
    results,
  })
})

// Also GET for convenience (returns scenario list without running)
export const GET = withAuth(async () => {
  return apiSuccess({
    scenarios: SCENARIOS.map(s => ({
      id: s.id, name: s.name, description: s.description, turnCount: s.turns.length,
    })),
  })
})
