import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { runWithTenant } from '@/lib/db/tenant-context'

export interface AuthenticatedRequest extends NextRequest {
  userId: string
  tenantId: string
  role: string
}

type ApiHandler = (
  req: NextRequest,
  context: {
    params: Record<string, string>
    userId: string
    tenantId: string
    role: string
  }
) => Promise<NextResponse | Response>

/**
 * withAuth — Requires authenticated session.
 * Injects userId, tenantId, role into handler context and sets tenant context for DB queries.
 */
export function withAuth(handler: ApiHandler) {
  return async (req: NextRequest, routeContext: { params: Promise<Record<string, string>> }) => {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: userId, tenantId, role } = session.user as any
    const params = await routeContext.params

    return runWithTenant({ tenantId, userId, role }, () =>
      handler(req, { params, userId, tenantId, role })
    )
  }
}

/**
 * withRole — Requires specific role(s). Must be used after withAuth.
 */
export function withRole(roles: string[], handler: ApiHandler) {
  return withAuth(async (req, ctx) => {
    if (!roles.includes(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return handler(req, ctx)
  })
}

/**
 * withAdmin — Shorthand for withRole(['admin', 'super_admin'])
 */
export function withAdmin(handler: ApiHandler) {
  return withRole(['admin', 'super_admin'], handler)
}

/**
 * withSuperAdmin — Shorthand for withRole(['super_admin'])
 */
export function withSuperAdmin(handler: ApiHandler) {
  return withRole(['super_admin'], handler)
}

/**
 * Standard API response helpers
 */
export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export function apiNotFound(entity = 'Resource') {
  return apiError(`${entity} not found`, 404)
}

/**
 * Parse JSON body safely
 */
export async function parseBody<T>(req: NextRequest): Promise<T | null> {
  try {
    return await req.json() as T
  } catch {
    return null
  }
}

/**
 * Parse query params with defaults
 */
export function parseQuery(req: NextRequest) {
  const url = new URL(req.url)
  return {
    get: (key: string) => url.searchParams.get(key),
    getInt: (key: string, defaultVal = 0) => {
      const val = url.searchParams.get(key)
      return val ? parseInt(val, 10) : defaultVal
    },
    getString: (key: string, defaultVal = '') => {
      return url.searchParams.get(key) || defaultVal
    },
    getPage: () => {
      const page = parseInt(url.searchParams.get('page') || '1', 10)
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100)
      return { page, limit, skip: (page - 1) * limit }
    },
  }
}
