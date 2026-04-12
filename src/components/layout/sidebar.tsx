'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, MessageSquare, Users, Kanban, Brain,
  FolderOpen, Settings, BarChart3, Smartphone, Bot,
  ChevronLeft, ChevronDown, LogOut, Zap, Wand2,
  FileText, CheckSquare, Shield, BookOpen, TestTube,
} from 'lucide-react'
import { signOut } from 'next-auth/react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  children?: NavItem[]
}

const navigation: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Inbox', href: '/inbox', icon: MessageSquare },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Pipeline', href: '/pipeline', icon: Kanban },
  {
    label: 'Knowledge',
    href: '/knowledge',
    icon: BookOpen,
    children: [
      { label: 'Sources', href: '/knowledge/sources', icon: FolderOpen },
      { label: 'FAQ', href: '/knowledge/faq', icon: FileText },
      { label: 'Chunks', href: '/knowledge/chunks', icon: FileText },
      { label: 'Review', href: '/knowledge/review', icon: CheckSquare },
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
      { label: 'Costs', href: '/analytics/cost', icon: FileText },
    ],
  },
  { label: 'Onboarding', href: '/onboarding', icon: Wand2 },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  function toggleGroup(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/analytics') return pathname === '/analytics'
    return pathname.startsWith(href)
  }

  return (
    <aside className={cn(
      'hidden md:flex flex-col h-screen bg-card border-r border-border shrink-0 transition-all duration-200',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Brand */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="leading-none">
              <span className="text-[13px] font-semibold text-foreground">WA Platform</span>
              <span className="block text-[10px] text-muted-foreground mt-0.5">by Ocianix</span>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
        >
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navigation.map((item) => {
          const hasChildren = !!item.children?.length
          const isOpen = openGroups.has(item.label)
          const active = isActive(item.href)
          const childActive = hasChildren && item.children!.some(c => isActive(c.href))

          if (hasChildren && !collapsed) {
            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={cn(
                    'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] transition-colors',
                    childActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  <item.icon className="w-[17px] h-[17px] shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="ml-[18px] pl-3 border-l border-border mt-0.5 space-y-0.5">
                    {item.children!.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] transition-colors',
                          isActive(child.href) ? 'text-primary font-medium bg-primary/5' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <child.icon className="w-3.5 h-3.5" />
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors',
                active ? 'bg-primary/8 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              <item.icon className="w-[17px] h-[17px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <LogOut className="w-[17px] h-[17px]" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
