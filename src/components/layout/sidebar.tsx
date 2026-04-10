'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Kanban,
  Brain,
  FolderOpen,
  Settings,
  BarChart3,
  Smartphone,
  Bot,
  ChevronLeft,
  LogOut,
  Zap,
  Wand2,
  FileText,
  CheckSquare,
  Shield,
  BookOpen,
  TestTube,
} from 'lucide-react'
import { signOut } from 'next-auth/react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: number
  children?: NavItem[]
}

const navigation: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Inbox', href: '/inbox', icon: MessageSquare },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Pipeline', href: '/pipeline', icon: Kanban },
  {
    label: 'Knowledge Base',
    href: '/knowledge',
    icon: BookOpen,
    children: [
      { label: 'Sources', href: '/knowledge/sources', icon: FolderOpen },
      { label: 'FAQ Manager', href: '/knowledge/faq', icon: FileText },
      { label: 'Answer Review', href: '/knowledge/review', icon: CheckSquare },
    ],
  },
  {
    label: 'AI Settings',
    href: '/ai',
    icon: Brain,
    children: [
      { label: 'Client Pack', href: '/ai/pack', icon: Bot },
      { label: 'Policies', href: '/ai/policies', icon: Shield },
      { label: 'Actions', href: '/ai/actions', icon: Zap },
      { label: 'Test Suite', href: '/ai/tests', icon: TestTube },
    ],
  },
  { label: 'WhatsApp', href: '/whatsapp', icon: Smartphone },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    children: [
      { label: 'Overview', href: '/analytics', icon: BarChart3 },
      { label: 'AI Performance', href: '/analytics/ai', icon: Brain },
      { label: 'Cost Tracking', href: '/analytics/cost', icon: FileText },
    ],
  },
  { label: 'Onboarding', href: '/onboarding', icon: Wand2 },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  function toggleGroup(label: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-card border-r border-border transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">WA Platform</span>
              <span className="block text-[10px] text-muted-foreground leading-none mt-0.5">by Ocianix</span>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
        >
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navigation.map((item) => {
          const hasChildren = item.children && item.children.length > 0
          const isGroupExpanded = expandedGroups.has(item.label)
          const active = isActive(item.href)
          const groupActive = hasChildren && item.children!.some(c => isActive(c.href))

          return (
            <div key={item.href}>
              {hasChildren && !collapsed ? (
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                    groupActive
                      ? 'text-foreground bg-muted/50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronLeft
                    className={cn(
                      'w-3.5 h-3.5 transition-transform',
                      isGroupExpanded ? '-rotate-90' : 'rotate-0'
                    )}
                  />
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                  {item.badge && !collapsed && (
                    <span className="ml-auto bg-primary/20 text-primary text-[11px] font-medium px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )}

              {/* Children */}
              {hasChildren && !collapsed && isGroupExpanded && (
                <div className="ml-4 pl-4 border-l border-border/50 mt-0.5 space-y-0.5">
                  {item.children!.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-colors',
                        isActive(child.href)
                          ? 'text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <child.icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{child.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
