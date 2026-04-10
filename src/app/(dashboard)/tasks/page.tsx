'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { CheckSquare, Circle, Clock, AlertTriangle, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface Task {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  dueAt: string | null
  completedAt: string | null
  contact: { id: string; name: string | null; phone: string } | null
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [newTask, setNewTask] = useState('')

  useEffect(() => {
    loadTasks()
  }, [filter])

  async function loadTasks() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (filter) params.set('status', filter)
      const data = await apiFetch<{ tasks: Task[] }>(`/api/tasks?${params}`)
      setTasks(data.tasks)
    } finally {
      setLoading(false)
    }
  }

  async function createTask() {
    if (!newTask.trim()) return
    await apiFetch('/api/tasks', {
      method: 'POST',
      body: { title: newTask.trim() },
    })
    setNewTask('')
    loadTasks()
  }

  const priorityColors: Record<string, string> = {
    urgent: 'text-red-400 bg-red-400/10',
    high: 'text-orange-400 bg-orange-400/10',
    medium: 'text-blue-400 bg-blue-400/10',
    low: 'text-slate-400 bg-slate-400/10',
  }

  const statusIcons: Record<string, React.ReactNode> = {
    todo: <Circle className="w-4 h-4 text-muted-foreground" />,
    in_progress: <Clock className="w-4 h-4 text-blue-400" />,
    done: <CheckSquare className="w-4 h-4 text-green-400" />,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">{tasks.length} tasks</p>
        </div>
      </div>

      {/* Quick add */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createTask()}
          placeholder="Add a new task..."
          className="flex-1 h-10 px-4 bg-card border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={createTask}
          disabled={!newTask.trim()}
          className="h-10 px-4 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-30 hover:bg-primary/80 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-1">
        {['', 'todo', 'in_progress', 'done'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              filter === f ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            {f === '' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">No tasks found</div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-border/80 transition-colors">
              {statusIcons[task.status] || statusIcons.todo}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium',
                  task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'
                )}>
                  {task.title}
                </p>
                {task.contact && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {task.contact.name || task.contact.phone}
                  </p>
                )}
              </div>
              <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', priorityColors[task.priority])}>
                {task.priority}
              </span>
              {task.dueAt && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(task.dueAt), 'dd MMM')}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
