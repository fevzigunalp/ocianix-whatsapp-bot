import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { format } from 'date-fns'

export default async function CostTrackingPage() {
  const session = await auth()
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId

  const costs = await db.costEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  const totalCost = costs.reduce((s, c) => s + Number(c.estimatedCostUsd || 0), 0)
  const totalInputTokens = costs.reduce((s, c) => s + (c.tokensInput || 0), 0)
  const totalOutputTokens = costs.reduce((s, c) => s + (c.tokensOutput || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cost Tracking</h1>
        <p className="text-sm text-muted-foreground mt-1">AI usage costs</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <span className="text-xs text-muted-foreground">Total Cost</span>
          <p className="text-2xl font-bold text-foreground mt-1">${totalCost.toFixed(4)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <span className="text-xs text-muted-foreground">Input Tokens</span>
          <p className="text-2xl font-bold text-foreground mt-1">{totalInputTokens.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <span className="text-xs text-muted-foreground">Output Tokens</span>
          <p className="text-2xl font-bold text-foreground mt-1">{totalOutputTokens.toLocaleString()}</p>
        </div>
      </div>

      {/* Recent costs */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Time</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Type</th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Input</th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Output</th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Cost</th>
            </tr>
          </thead>
          <tbody>
            {costs.slice(0, 20).map(cost => (
              <tr key={cost.id} className="border-b border-border/50">
                <td className="px-4 py-2 text-xs text-muted-foreground">{format(new Date(cost.createdAt), 'dd MMM HH:mm')}</td>
                <td className="px-4 py-2 text-xs text-foreground">{cost.eventType}</td>
                <td className="px-4 py-2 text-xs text-foreground text-right">{cost.tokensInput?.toLocaleString()}</td>
                <td className="px-4 py-2 text-xs text-foreground text-right">{cost.tokensOutput?.toLocaleString()}</td>
                <td className="px-4 py-2 text-xs text-foreground text-right">${Number(cost.estimatedCostUsd || 0).toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {costs.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No cost data yet</div>
        )}
      </div>
    </div>
  )
}
