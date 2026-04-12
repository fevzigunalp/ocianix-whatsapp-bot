/**
 * Faithfulness guardrail — Phase 2.7
 *
 * Cheap, regex-only post-check that flags AI responses containing
 * specific factual claims (numbers, URLs, phone numbers) that don't
 * appear in any retrieved knowledge snippet.
 *
 * Philosophy:
 * - Runs in <1ms, no network, no AI call.
 * - Conservative: only flags 2+ digit numbers, recognizable URLs,
 *   and phone-like sequences (>=10 digits). Single-digit counts
 *   ("1 dakika", "3 gün") never trigger a violation.
 * - Treats the concatenation of all retrieved snippets as the ground
 *   truth. A claim is "supported" if its literal or digit-normalized
 *   form appears anywhere in that text.
 */

export interface FaithfulnessResult {
  pass: boolean
  violations: string[] // machine-readable codes
  unsupportedNumbers: string[]
  unsupportedUrls: string[]
  unsupportedPhones: string[]
}

// 2+ digit integers OR decimals (allows "1.500,00" and "1,500.00")
const NUMBER_RE = /\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\b/g
// Domain-like tokens. Needs at least one dot + TLD of >=2 letters.
const URL_RE = /\b(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s]*)?/gi
// Phone-like runs with at least 10 digits after stripping
const PHONE_RE = /(?:\+?\d[\d\s\-()./]{8,}\d)/g

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

export function extractNumbers(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.match(NUMBER_RE) || []) {
    const d = onlyDigits(m)
    if (d.length >= 2) out.add(m)
  }
  return [...out]
}

export function extractUrls(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.match(URL_RE) || []) {
    out.add(m.toLowerCase().replace(/[.,;:!?)]+$/, ''))
  }
  return [...out]
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.match(PHONE_RE) || []) {
    if (onlyDigits(m).length >= 10) out.add(m.trim())
  }
  return [...out]
}

export function compareWithSources(output: string, sources: string[]): FaithfulnessResult {
  const sourceText = sources.join(' \n ').toLowerCase()
  const sourceDigits = onlyDigits(sourceText)

  const unsupportedNumbers: string[] = []
  const unsupportedUrls: string[] = []
  const unsupportedPhones: string[] = []

  for (const n of extractNumbers(output)) {
    const literal = n.toLowerCase()
    const digits = onlyDigits(n)
    const found =
      sourceText.includes(literal) ||
      (digits.length >= 2 && sourceDigits.includes(digits))
    if (!found) unsupportedNumbers.push(n)
  }

  for (const u of extractUrls(output)) {
    const bare = u.replace(/^https?:\/\//, '').replace(/\/+$/, '')
    if (!sourceText.includes(bare) && !sourceText.includes(u)) {
      unsupportedUrls.push(u)
    }
  }

  for (const p of extractPhones(output)) {
    const d = onlyDigits(p)
    if (d.length >= 10 && !sourceDigits.includes(d)) {
      unsupportedPhones.push(p)
    }
  }

  const violations: string[] = []
  if (unsupportedNumbers.length) violations.push('number_not_in_sources')
  if (unsupportedUrls.length) violations.push('url_not_in_sources')
  if (unsupportedPhones.length) violations.push('phone_not_in_sources')

  return {
    pass: violations.length === 0,
    violations,
    unsupportedNumbers,
    unsupportedUrls,
    unsupportedPhones,
  }
}

/**
 * Convenience wrapper around compareWithSources.
 */
export function validateResponse(output: string, sources: string[]): FaithfulnessResult {
  return compareWithSources(output, sources)
}

/**
 * Builds a strict correction addendum for the retry prompt, listing
 * the specific unsupported spans the AI must stop emitting.
 */
export function buildStrictCorrection(r: FaithfulnessResult): string {
  const parts: string[] = [
    'STRICT CORRECTION — your previous draft contained details NOT supported by KNOWN FACTS.',
    'Rewrite the reply using ONLY facts from KNOWN FACTS. If a detail is not in facts, do NOT state it — say you will check and have a colleague follow up.',
  ]
  if (r.unsupportedNumbers.length) parts.push(`- Unsupported numbers: ${r.unsupportedNumbers.join(', ')}`)
  if (r.unsupportedUrls.length) parts.push(`- Unsupported URLs: ${r.unsupportedUrls.join(', ')}`)
  if (r.unsupportedPhones.length) parts.push(`- Unsupported phones: ${r.unsupportedPhones.join(', ')}`)
  parts.push('Return the SAME JSON schema as before.')
  return parts.join('\n')
}
