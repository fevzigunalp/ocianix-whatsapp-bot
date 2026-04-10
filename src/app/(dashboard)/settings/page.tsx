import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { Settings, Building, User, Key } from 'lucide-react'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) return null
  const tenantId = (session.user as any).tenantId

  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
  const userCount = await db.user.count({ where: { tenantId } })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <Building className="w-4 h-4 text-primary" /> Organization
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <p className="text-sm text-foreground">{tenant?.name}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Slug</label>
              <p className="text-sm text-foreground">{tenant?.slug}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Plan</label>
              <p className="text-sm text-foreground capitalize">{tenant?.plan}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Team Members</label>
              <p className="text-sm text-foreground">{userCount}</p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <User className="w-4 h-4 text-primary" /> Profile
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <p className="text-sm text-foreground">{session.user.name || 'N/A'}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <p className="text-sm text-foreground">{session.user.email}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Role</label>
              <p className="text-sm text-foreground capitalize">{(session.user as any).role}</p>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <Key className="w-4 h-4 text-primary" /> Integrations
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Anthropic API</span>
              <span className="text-xs text-muted-foreground">
                {process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Evolution API</span>
              <span className="text-xs text-muted-foreground">
                {process.env.EVOLUTION_API_KEY ? 'Configured' : 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">n8n</span>
              <span className="text-xs text-muted-foreground">
                {process.env.N8N_URL ? 'Configured' : 'Not set'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
