import { AsyncLocalStorage } from 'async_hooks'

interface TenantContext {
  tenantId: string
  userId?: string
  role?: string
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>()

export function getCurrentTenantId(): string {
  const ctx = tenantStorage.getStore()
  if (!ctx?.tenantId) throw new Error('Tenant context required — ensure middleware is applied')
  return ctx.tenantId
}

export function getCurrentUserId(): string | undefined {
  return tenantStorage.getStore()?.userId
}

export function getCurrentRole(): string | undefined {
  return tenantStorage.getStore()?.role
}

export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn)
}
