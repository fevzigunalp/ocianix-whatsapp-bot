import { db } from '@/lib/db'

export interface PolicyResult {
  outcome: 'pass' | 'block' | 'modify' | 'escalate' | 'collect'
  policyId?: string
  policyType?: string
  responseOverride?: string
  collectFields?: string[]
  triggerMethod?: 'keyword' | 'semantic'
}

/**
 * Policy Engine — 2-layer evaluation (keyword + semantic)
 * Pre-response: checks incoming message against refuse, collect, ask, escalate policies
 * Post-response: checks AI response against refuse, inform, restrict policies
 */
export async function evaluatePolicies(
  message: string,
  phase: 'pre_response' | 'post_response',
  responseText: string | null,
  tenantId: string
): Promise<PolicyResult> {
  // Load active policies sorted by priority DESC
  const policies = await db.policy.findMany({
    where: {
      tenantId,
      isActive: true,
    },
    orderBy: { priority: 'desc' },
  })

  const preTypes = ['refuse', 'collect', 'ask', 'escalate']
  const postTypes = ['refuse', 'inform', 'restrict']
  const relevantPolicies = policies.filter(p =>
    phase === 'pre_response' ? preTypes.includes(p.policyType) : postTypes.includes(p.policyType)
  )

  const textToCheck = phase === 'pre_response' ? message : (responseText || '')

  for (const policy of relevantPolicies) {
    // LAYER 1: Keyword match (fast, <1ms)
    if (policy.keywords.length > 0) {
      const matched = policy.keywords.some(kw =>
        textToCheck.toLowerCase().includes(kw.toLowerCase())
      )
      if (matched) {
        await logPolicy(tenantId, policy.id, phase, 'keyword', determineOutcome(policy.policyType))
        return applyPolicy(policy)
      }
    }

    // LAYER 2: Semantic check (only for complex rules without keywords)
    // This would call Claude for semantic analysis — skipped in fast path
    // Will be triggered by n8n workflow for non-keyword policies
    if (policy.keywords.length === 0) {
      // For now, skip semantic — will be implemented with Claude integration
      // In production: await semanticPolicyCheck(policy, textToCheck)
    }
  }

  return { outcome: 'pass' }
}

function determineOutcome(policyType: string): string {
  switch (policyType) {
    case 'refuse': return 'block'
    case 'escalate': return 'escalate'
    case 'collect': return 'collect'
    case 'inform': return 'modify'
    case 'restrict': return 'modify'
    default: return 'pass'
  }
}

function applyPolicy(policy: any): PolicyResult {
  switch (policy.policyType) {
    case 'refuse':
      return {
        outcome: 'block',
        policyId: policy.id,
        policyType: policy.policyType,
        responseOverride: 'Bu konuda size yardımcı olamıyorum. Başka bir konuda yardımcı olabilir miyim?',
      }
    case 'escalate':
      return {
        outcome: 'escalate',
        policyId: policy.id,
        policyType: policy.policyType,
        responseOverride: 'Sizi yetkili bir temsilcimize aktarıyorum. Lütfen bekleyiniz.',
      }
    case 'collect':
      return {
        outcome: 'collect',
        policyId: policy.id,
        policyType: policy.policyType,
        collectFields: extractCollectFields(policy.ruleText),
      }
    case 'inform':
      return {
        outcome: 'modify',
        policyId: policy.id,
        policyType: policy.policyType,
        // Append disclaimer to response
      }
    case 'restrict':
      return {
        outcome: 'modify',
        policyId: policy.id,
        policyType: policy.policyType,
      }
    default:
      return { outcome: 'pass' }
  }
}

function extractCollectFields(ruleText: string): string[] {
  // Simple extraction — in production, Claude would parse this
  const fields: string[] = []
  const lower = ruleText.toLowerCase()
  if (lower.includes('isim') || lower.includes('name') || lower.includes('ad')) fields.push('name')
  if (lower.includes('telefon') || lower.includes('phone') || lower.includes('numara')) fields.push('phone')
  if (lower.includes('email') || lower.includes('e-posta')) fields.push('email')
  if (lower.includes('şehir') || lower.includes('city')) fields.push('city')
  return fields.length > 0 ? fields : ['name', 'phone']
}

async function logPolicy(
  tenantId: string,
  policyId: string,
  phase: string,
  method: string,
  outcome: string
) {
  await db.policyLog.create({
    data: {
      tenantId,
      policyId,
      triggerPhase: phase,
      triggerMethod: method,
      outcome,
    },
  })
}
