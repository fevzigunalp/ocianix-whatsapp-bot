import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { CheckCircle, XCircle, SkipForward, BookOpen } from 'lucide-react'

export default async function AnswerReviewPage() {
  const session = await auth()
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId

  const logs = await db.aiLog.findMany({
    where: { tenantId, conversationId: { not: 'test' } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      conversation: {
        include: {
          contact: { select: { name: true, phone: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 2,
          },
        },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Answer Review</h1>
        <p className="text-sm text-muted-foreground mt-1">Review and correct AI responses</p>
      </div>

      <div className="space-y-3">
        {logs.map(log => {
          const customerMsg = log.conversation?.messages?.find(m => m.direction === 'inbound')
          const aiMsg = log.conversation?.messages?.find(m => m.sender === 'ai')

          return (
            <div key={log.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs text-muted-foreground">
                    {log.conversation?.contact?.name || log.conversation?.contact?.phone || 'Unknown'}
                  </span>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{log.intent}</span>
                    <span className="text-[10px] text-muted-foreground">Confidence: {log.confidence}%</span>
                    <span className="text-[10px] text-muted-foreground">Decision: {log.decision}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-400" title="Correct">
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400" title="Wrong">
                    <XCircle className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-400" title="Convert to FAQ">
                    <BookOpen className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {customerMsg && (
                <div className="bg-muted/30 rounded-lg px-3 py-2 mb-2">
                  <span className="text-[10px] text-muted-foreground">Customer:</span>
                  <p className="text-sm text-foreground">{customerMsg.body}</p>
                </div>
              )}
              {aiMsg && (
                <div className="bg-violet-500/5 border border-violet-500/10 rounded-lg px-3 py-2">
                  <span className="text-[10px] text-violet-400">AI:</span>
                  <p className="text-sm text-foreground">{aiMsg.body}</p>
                </div>
              )}
            </div>
          )
        })}

        {logs.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">No AI logs to review</div>
        )}
      </div>
    </div>
  )
}
