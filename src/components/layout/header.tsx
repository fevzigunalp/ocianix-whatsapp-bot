'use client'

import { useSession } from 'next-auth/react'
import { Bell, Search } from 'lucide-react'

export function Header() {
  const { data: session } = useSession()
  const user = session?.user

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center justify-between px-5">
      {/* Search */}
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full h-8 pl-8 pr-3 bg-muted/60 border border-transparent rounded-lg text-[13px] text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <button className="relative p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
        </button>

        <div className="w-px h-6 bg-border" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
            {user?.name?.[0] || user?.email?.[0] || 'U'}
          </div>
          <div className="hidden sm:block leading-none">
            <p className="text-[13px] font-medium text-foreground">{user?.name || 'User'}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">{(user as any)?.role || 'agent'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
