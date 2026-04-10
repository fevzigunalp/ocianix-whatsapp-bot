import { db } from '.'
import { getCurrentTenantId } from './tenant-context'

/**
 * Helper to always include tenant_id in where clauses.
 * Use this instead of raw db calls to ensure tenant isolation.
 */
export function tenantWhere(extra: Record<string, unknown> = {}) {
  return { tenant_id: getCurrentTenantId(), ...extra }
}

/**
 * Helper to include tenant_id in create data.
 */
export function tenantData<T extends Record<string, unknown>>(data: T): T & { tenant_id: string } {
  return { ...data, tenant_id: getCurrentTenantId() } as T & { tenant_id: string }
}

export { db }
