'use client'

import { useSession } from 'next-auth/react'
import { Bell, Search } from 'lucide-react'

export function Header() {
  const { data: session } = useSession()
  const user = session?.user

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search contacts, conversations..."
            className="w-full h-9 pl-9 pr-4 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors">
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
            {user?.name?.[0] || user?.email?.[0] || 'U'}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-foreground leading-none">{user?.name || 'User'}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{(user as any)?.role || 'agent'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
