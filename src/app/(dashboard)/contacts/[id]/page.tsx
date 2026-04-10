import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { Phone, Mail, Calendar, Tag, MessageSquare, TrendingUp, CheckSquare, StickyNote } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId

  const contact = await db.contact.findFirst({
    where: { id, tenantId },
    include: {
      conversations: {
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      },
      deals: {
        include: { stage: { select: { name: true, color: true } } },
        orderBy: { createdAt: 'desc' },
      },
      tasks: { orderBy: { createdAt: 'desc' }, take: 5 },
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { author: { select: { name: true } } },
      },
    },
  })

  if (!contact) notFound()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
          {contact.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{contact.name || 'Unknown'}</h1>
          <div className="flex items-center gap-4 mt-1">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="w-3.5 h-3.5" /> {contact.phone}
            </span>
            {contact.email && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Mail className="w-3.5 h-3.5" /> {contact.email}
              </span>
            )}
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" /> Since {format(new Date(contact.firstSeenAt), 'dd MMM yyyy')}
            </span>
          </div>
          {contact.tags.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {contact.tags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversations */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <MessageSquare className="w-4 h-4 text-blue-400" /> Conversations ({contact.conversations.length})
          </h2>
          <div className="space-y-3">
            {contact.conversations.map((conv) => (
              <Link key={conv.id} href="/inbox" className="block p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium capitalize text-foreground">{conv.status}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(conv.updatedAt), 'dd MMM HH:mm')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">
                  {conv.messages[0]?.body || 'No messages'}
                </p>
              </Link>
            ))}
            {contact.conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No conversations</p>
            )}
          </div>
        </div>

        {/* Deals */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Deals ({contact.deals.length})
          </h2>
          <div className="space-y-3">
            {contact.deals.map((deal) => (
              <div key={deal.id} className="p-2.5 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{deal.title}</span>
                  <span className="text-xs font-medium text-foreground">
                    {Number(deal.value).toLocaleString()} {deal.currency}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: deal.stage.color }} />
                  <span className="text-xs text-muted-foreground">{deal.stage.name}</span>
                </div>
              </div>
            ))}
            {contact.deals.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No deals</p>
            )}
          </div>
        </div>

        {/* Tasks & Notes */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
              <CheckSquare className="w-4 h-4 text-amber-400" /> Tasks ({contact.tasks.length})
            </h2>
            <div className="space-y-2">
              {contact.tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${
                    task.status === 'done' ? 'bg-green-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-slate-500'
                  }`} />
                  <span className="text-foreground flex-1 truncate">{task.title}</span>
                  {task.dueAt && (
                    <span className="text-muted-foreground shrink-0">
                      {format(new Date(task.dueAt), 'dd MMM')}
                    </span>
                  )}
                </div>
              ))}
              {contact.tasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No tasks</p>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
              <StickyNote className="w-4 h-4 text-violet-400" /> Notes ({contact.notes.length})
            </h2>
            <div className="space-y-2.5">
              {contact.notes.map((note) => (
                <div key={note.id} className="text-xs">
                  <p className="text-foreground">{note.body}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {note.author.name} - {format(new Date(note.createdAt), 'dd MMM HH:mm')}
                  </p>
                </div>
              ))}
              {contact.notes.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No notes</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
