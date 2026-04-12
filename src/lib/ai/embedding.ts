/**
 * Embedding layer — OpenAI text-embedding-3-small (1536 dims) + pgvector.
 *
 * Graceful: if OPENAI_API_KEY is missing or the call fails, every helper
 * returns null/false and the knowledge engine falls back to text matching.
 *
 * Schema bootstrap is lazy & idempotent: the first caller in a process
 * runs the CREATE EXTENSION + ADD COLUMN IF NOT EXISTS statements, then
 * caches the result for the lifetime of the process.
 */

import { db } from '@/lib/db'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMS = 1536
const TIMEOUT_MS = 10000

let schemaReady: Promise<boolean> | null = null

export function isEmbeddingEnabled(): boolean {
  return Boolean(OPENAI_API_KEY)
}

/**
 * Idempotently ensure pgvector + embedding columns exist.
 * Safe to call on every request — the Promise is cached per process.
 */
export async function ensureVectorSchema(): Promise<boolean> {
  if (schemaReady) return schemaReady
  schemaReady = (async () => {
    try {
      await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`)
      await db.$executeRawUnsafe(
        `ALTER TABLE faq_pairs ADD COLUMN IF NOT EXISTS question_embedding vector(${EMBEDDING_DIMS})`
      )
      await db.$executeRawUnsafe(
        `ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS content_embedding vector(${EMBEDDING_DIMS})`
      )
      return true
    } catch (err: any) {
      console.error('[Embedding] Schema bootstrap failed:', err.message)
      schemaReady = null // allow retry next call
      return false
    }
  })()
  return schemaReady
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null
  const input = text.replace(/\s+/g, ' ').trim().slice(0, 8000)
  if (!input) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[Embedding] OpenAI error', res.status, body.slice(0, 200))
      return null
    }
    const data = await res.json()
    const vec = data?.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) return null
    return vec
  } catch (err: any) {
    if (err.name !== 'AbortError') console.error('[Embedding] Error:', err.message)
    return null
  }
}

/** Postgres vector literal: "[0.1,0.2,...]" */
export function toPgVector(vec: number[]): string {
  return '[' + vec.map(n => (Number.isFinite(n) ? n.toFixed(7) : 0)).join(',') + ']'
}

export async function embedFaq(id: string, question: string, answer?: string): Promise<boolean> {
  const ok = await ensureVectorSchema()
  if (!ok) return false
  const vec = await generateEmbedding(answer ? `${question}\n${answer}` : question)
  if (!vec) return false
  try {
    await db.$executeRawUnsafe(
      `UPDATE faq_pairs SET question_embedding = $1::vector WHERE id = $2::uuid`,
      toPgVector(vec),
      id,
    )
    return true
  } catch (err: any) {
    console.error('[Embedding] embedFaq failed:', err.message)
    return false
  }
}

export async function embedChunk(id: string, content: string): Promise<boolean> {
  const ok = await ensureVectorSchema()
  if (!ok) return false
  const vec = await generateEmbedding(content)
  if (!vec) return false
  try {
    await db.$executeRawUnsafe(
      `UPDATE knowledge_chunks SET content_embedding = $1::vector WHERE id = $2::uuid`,
      toPgVector(vec),
      id,
    )
    return true
  } catch (err: any) {
    console.error('[Embedding] embedChunk failed:', err.message)
    return false
  }
}
