import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { MessageSquare, Users, Bot, TrendingUp, CheckCircle, Clock } from 'lucide-react'

async function getStats(tenantId: string) {
  const [totalContacts, openConversations, totalMessages, totalDeals, resolvedToday, pendingTasks] = await Promise.all([
    db.contact.count({ where: { tenantId } }),
    db.conversation.count({ where: { tenantId, status: 'open' } }),
    db.message.count({ where: { tenantId } }),
    db.deal.count({ where: { tenantId, status: 'open' } }),
    db.conversation.count({
      where: { tenantId, status: 'resolved', updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    db.task.count({ where: { tenantId, status: { in: ['todo', 'in_progress'] } } }),
  ])
  return { totalContacts, openConversations, totalMessages, totalDeals, resolvedToday, pendingTasks }
}

async function getRecentActivity(tenantId: string) {
  return db.message.findMany({
    where: { tenantId, direction: 'inbound' },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { conversation: { include: { contact: true } } },
  })
}

async function getPipelineData(tenantId: string) {
  const stages = await db.pipelineStage.findMany({
    where: { tenantId },
    orderBy: { position: 'asc' },
    include: {
      _count: { select: { deals: true } },
      deals: { where: { status: 'open' }, select: { value: true } },
    },
  })
  return stages.map(s => ({
    name: s.name,
    color: s.color,
    count: s._count.deals,
    value: s.deals.reduce((sum, d) => sum + Number(d.value), 0),
  }))
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId

  const [stats, recentActivity, pipelineData] = await Promise.all([
    getStats(tenantId),
    getRecentActivity(tenantId),
    getPipelineData(tenantId),
  ])

  const statCards = [
    { label: 'Open Conversations', value: stats.openConversations, icon: MessageSquare, color: 'text-pastel-blue', bg: 'bg-pastel-blue/8' },
    { label: 'Total Contacts', value: stats.totalContacts, icon: Users, color: 'text-pastel-green', bg: 'bg-pastel-green/8' },
    { label: 'AI Messages', value: stats.totalMessages, icon: Bot, color: 'text-pastel-purple', bg: 'bg-pastel-purple/8' },
    { label: 'Active Deals', value: stats.totalDeals, icon: TrendingUp, color: 'text-pastel-orange', bg: 'bg-pastel-orange/8' },
    { label: 'Resolved Today', value: stats.resolvedToday, icon: CheckCircle, color: 'text-success', bg: 'bg-success/8' },
    { label: 'Pending Tasks', value: stats.pendingTasks, icon: Clock, color: 'text-pastel-rose', bg: 'bg-pastel-rose/8' },
  ]

  const totalPipelineDeals = pipelineData.reduce((s, p) => s + p.count, 0)

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Welcome back, {session.user.name || 'Admin'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className={`inline-flex p-2 rounded-lg ${card.bg} mb-3`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground leading-none">{card.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Pipeline Overview</h2>
          {pipelineData.length > 0 ? (
            <>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-muted mb-4">
                {pipelineData.map((stage) => (
                  <div
                    key={stage.name}
                    className="h-full transition-all"
                    style={{
                      width: totalPipelineDeals > 0 ? `${(stage.count / totalPipelineDeals) * 100}%` : '0%',
                      backgroundColor: stage.color,
                      minWidth: stage.count > 0 ? '6px' : '0',
                    }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {pipelineData.map((stage) => (
                  <div key={stage.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground truncate">{stage.name}</p>
                      <p className="text-[13px] font-medium text-foreground">{stage.count}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center py-8 text-sm text-muted-foreground">No pipeline data yet</p>
          )}
        </div>

        {/* Recent */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Recent Messages</h2>
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground shrink-0">
                    {msg.conversation?.contact?.name?.[0] || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate">
                      {msg.conversation?.contact?.name || msg.conversation?.contact?.phone || 'Unknown'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{msg.body || '[media]'}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(msg.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-sm text-muted-foreground">No messages yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
