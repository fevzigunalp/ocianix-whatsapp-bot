import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import Link from 'next/link'
import { Users, Phone, Mail, MessageSquare, TrendingUp, Search } from 'lucide-react'
import { format } from 'date-fns'

export default async function ContactsPage() {
  const session = await auth()
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId

  const contacts = await db.contact.findMany({
    where: { tenantId },
    orderBy: { lastSeenAt: 'desc' },
    take: 50,
    include: {
      _count: { select: { conversations: true, deals: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">{contacts.length} total contacts</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Contact</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Phone</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Tags</th>
              <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Convos</th>
              <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Deals</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${contact.id}`} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                      {contact.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{contact.name || 'Unknown'}</p>
                      {contact.email && (
                        <p className="text-xs text-muted-foreground">{contact.email}</p>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground">{contact.phone}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {contact.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-sm text-foreground">{contact._count.conversations}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-sm text-foreground">{contact._count.deals}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(contact.lastSeenAt), 'dd MMM yyyy HH:mm')}
                  </span>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                  No contacts yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
