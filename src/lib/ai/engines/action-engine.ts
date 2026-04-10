import { db } from '@/lib/db'
import { redis, tenantKey } from '@/lib/redis'
import { sleep } from '@/lib/utils'

export interface ActionResult {
  status: 'success' | 'failed' | 'rejected' | 'timeout'
  data?: any
  error?: string
}

interface ActionContext {
  tenantId: string
  conversationId: string
  contactId: string
}

/**
 * Action Engine — Execute registered actions with rate limiting, timeout, retry
 */
export async function executeAction(
  actionName: string,
  params: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  // 1. Find action definition
  const action = await db.actionDefinition.findFirst({
    where: { tenantId: context.tenantId, name: actionName, isEnabled: true },
  })
  if (!action) return { status: 'rejected', error: 'Action not found or disabled' }

  // 2. Rate limit check
  const rateKey = tenantKey(context.tenantId, 'action', actionName, 'hourly')
  const hourlyCount = await redis.incr(rateKey)
  if (hourlyCount === 1) await redis.expire(rateKey, 3600)
  if (hourlyCount > action.maxExecutionsPerHour) {
    return { status: 'rejected', error: 'Rate limit exceeded' }
  }

  // 3. Validate parameters against schema
  const validation = validateParams(params, action.parameterSchema as any)
  if (!validation.valid) {
    return { status: 'rejected', error: `Invalid params: ${validation.errors.join(', ')}` }
  }

  // 4. Execute with timeout + retry
  const startTime = Date.now()
  let lastError: string | null = null

  for (let attempt = 0; attempt <= action.retryCount; attempt++) {
    try {
      const result = await Promise.race([
        executeByType(action, params, context),
        timeoutPromise(action.timeoutMs),
      ])

      const executionTimeMs = Date.now() - startTime
      await logAction(action.id, context, params, result, 'success', attempt, executionTimeMs)
      return { status: 'success', data: result }
    } catch (err: any) {
      lastError = err.message
      if (attempt < action.retryCount) {
        await sleep(1000 * (attempt + 1))
      }
    }
  }

  const executionTimeMs = Date.now() - startTime
  await logAction(action.id, context, params, null, 'failed', action.retryCount, executionTimeMs, lastError)
  return { status: 'failed', error: lastError || 'Unknown error' }
}

async function executeByType(action: any, params: any, context: ActionContext) {
  const config = action.executionConfig as any

  switch (action.executionType) {
    case 'internal': {
      const handler = INTERNAL_HANDLERS[config.handler]
      if (!handler) throw new Error(`Unknown handler: ${config.handler}`)
      return handler(params, context)
    }

    case 'n8n_webhook': {
      const res = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, _context: context }),
      })
      if (!res.ok) throw new Error(`n8n webhook failed: ${res.status}`)
      return res.json()
    }

    case 'external_api': {
      const url = new URL(config.url)
      if (action.allowedDomains?.length > 0 && !action.allowedDomains.includes(url.hostname)) {
        throw new Error(`Domain ${url.hostname} not in allowlist`)
      }
      const res = await fetch(config.url, {
        method: config.method || 'POST',
        headers: { ...config.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error(`External API failed: ${res.status}`)
      return res.json()
    }

    default:
      throw new Error(`Unknown execution type: ${action.executionType}`)
  }
}

// Built-in internal action handlers
const INTERNAL_HANDLERS: Record<string, (params: any, ctx: ActionContext) => Promise<any>> = {
  create_lead: async (params, ctx) => {
    const defaultStage = await db.pipelineStage.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { position: 'asc' },
    })
    if (!defaultStage) throw new Error('No pipeline stages configured')

    const deal = await db.deal.create({
      data: {
        tenantId: ctx.tenantId,
        contactId: ctx.contactId,
        title: params.title || 'New Lead',
        stageId: defaultStage.id,
        value: params.value || 0,
        currency: params.currency || 'TRY',
      },
    })
    return { deal_id: deal.id }
  },

  handoff: async (params, ctx) => {
    await db.conversation.update({
      where: { id: ctx.conversationId },
      data: { aiEnabled: false, handlerType: 'human', assignedTo: null },
    })
    return { handed_off: true }
  },

  add_tag: async (params, ctx) => {
    const contact = await db.contact.findUnique({ where: { id: ctx.contactId } })
    if (!contact) throw new Error('Contact not found')
    const tags = [...new Set([...contact.tags, params.tag_name])]
    await db.contact.update({ where: { id: ctx.contactId }, data: { tags } })
    return { tagged: true }
  },

  create_task: async (params, ctx) => {
    const task = await db.task.create({
      data: {
        tenantId: ctx.tenantId,
        title: params.title,
        contactId: ctx.contactId,
        dueAt: params.due_at ? new Date(params.due_at) : new Date(Date.now() + 86400000),
        priority: params.priority || 'medium',
      },
    })
    return { task_id: task.id }
  },

  send_file: async (params, ctx) => {
    // Evolution API send would go here
    return { sent: true, file_url: params.file_url }
  },
}

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
}

function validateParams(params: any, schema: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!schema || !schema.properties) return { valid: true, errors: [] }

  const required = schema.required || []
  for (const field of required) {
    if (params[field] === undefined || params[field] === null || params[field] === '') {
      errors.push(`Missing required field: ${field}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

async function logAction(
  actionId: string,
  context: ActionContext,
  parameters: any,
  result: any,
  status: string,
  retryAttempt: number,
  executionTimeMs: number,
  errorMessage?: string | null
) {
  await db.actionLog.create({
    data: {
      tenantId: context.tenantId,
      actionId,
      conversationId: context.conversationId,
      contactId: context.contactId,
      parameters,
      result,
      status,
      retryAttempt,
      executionTimeMs,
      errorMessage,
    },
  })
}
