import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export default async function AIPerformancePage() {
  const session = await auth()
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId

  const recentLogs = await db.aiLog.findMany({
    where: { tenantId, conversationId: { not: 'test' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Calculate stats
  const intents = recentLogs.reduce((acc, log) => {
    const intent = log.intent || 'OTHER'
    acc[intent] = (acc[intent] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const decisions = recentLogs.reduce((acc, log) => {
    const d = log.decision || 'unknown'
    acc[d] = (acc[d] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const avgLatency = recentLogs.length > 0
    ? Math.round(recentLogs.reduce((s, l) => s + (l.latencyMs || 0), 0) / recentLogs.length)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Performance</h1>
        <p className="text-sm text-muted-foreground mt-1">Last {recentLogs.length} AI decisions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Intent Distribution */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Intent Distribution</h2>
          <div className="space-y-2">
            {Object.entries(intents).sort(([,a], [,b]) => b - a).map(([intent, count]) => (
              <div key={intent} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{intent}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(count / recentLogs.length) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-foreground w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decision Distribution */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Decision Types</h2>
          <div className="space-y-2">
            {Object.entries(decisions).sort(([,a], [,b]) => b - a).map(([decision, count]) => (
              <div key={decision} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground capitalize">{decision}</span>
                <span className="text-xs font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Performance */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Performance</h2>
          <div className="space-y-4">
            <div>
              <span className="text-xs text-muted-foreground block">Avg Latency</span>
              <span className="text-lg font-bold text-foreground">{avgLatency}ms</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Total Decisions</span>
              <span className="text-lg font-bold text-foreground">{recentLogs.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
