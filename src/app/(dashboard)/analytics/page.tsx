import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { BarChart3, MessageSquare, Bot, TrendingUp, DollarSign, Users } from 'lucide-react'

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalMessages30d,
    aiMessages30d,
    totalConversations30d,
    aiLogs30d,
    avgConfidence,
    totalCost30d,
  ] = await Promise.all([
    db.message.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    db.message.count({ where: { tenantId, sender: 'ai', createdAt: { gte: thirtyDaysAgo } } }),
    db.conversation.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    db.aiLog.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    db.aiLog.aggregate({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } }, _avg: { confidence: true } }),
    db.costEvent.aggregate({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } }, _sum: { estimatedCostUsd: true } }),
  ])

  const stats = [
    { label: 'Messages (30d)', value: totalMessages30d, icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'AI Responses', value: aiMessages30d, icon: Bot, color: 'text-violet-400', bg: 'bg-violet-400/10' },
    { label: 'Conversations', value: totalConversations30d, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'AI Decisions', value: aiLogs30d, icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Avg Confidence', value: `${Math.round(avgConfidence._avg.confidence || 0)}%`, icon: BarChart3, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
    { label: 'Total Cost', value: `$${Number(totalCost30d._sum.estimatedCostUsd || 0).toFixed(2)}`, icon: DollarSign, color: 'text-rose-400', bg: 'bg-rose-400/10' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Last 30 days overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`p-2 rounded-lg ${stat.bg} inline-flex mb-3`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">AI Performance</h2>
          <p className="text-sm text-muted-foreground">Detailed AI performance charts will be rendered here with historical data.</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Cost Tracking</h2>
          <p className="text-sm text-muted-foreground">Daily cost breakdown and projections will be displayed here.</p>
        </div>
      </div>
    </div>
  )
}
