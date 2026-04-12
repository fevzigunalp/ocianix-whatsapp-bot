import { db } from '@/lib/db'
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api/middleware'
import { embedFaq } from '@/lib/ai/embedding'

export const GET = withAuth(async (req, { tenantId }) => {
  const faqs = await db.faqPair.findMany({
    where: { tenantId },
    orderBy: { usageCount: 'desc' },
  })
  return apiSuccess({ faqs })
})

export const POST = withAuth(async (req, { tenantId }) => {
  const body = await parseBody<{
    question: string
    answer: string
    category?: string
  }>(req)

  if (!body?.question || !body?.answer) return apiError('question and answer required')

  const faq = await db.faqPair.create({
    data: {
      tenantId,
      question: body.question,
      answer: body.answer,
      category: body.category,
    },
  })

  // Fire-and-forget embedding so the response stays fast
  embedFaq(faq.id, faq.question, faq.answer).catch(err =>
    console.error('[FAQ] embedding failed:', err.message)
  )

  return apiSuccess({ faq }, 201)
})
