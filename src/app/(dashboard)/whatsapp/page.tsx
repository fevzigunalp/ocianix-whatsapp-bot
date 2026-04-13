'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/hooks/use-api'
import { Smartphone, Plus, RefreshCw, Wifi, WifiOff, QrCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface Instance {
  id: string
  instanceName: string
  phoneNumber: string | null
  status: string
  qrCode: string | null
  lastConnectedAt: string | null
}

export default function WhatsAppPage() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [qrData, setQrData] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    loadInstances()
  }, [])

  async function loadInstances() {
    try {
      const data = await apiFetch<{ instances: Instance[] }>('/api/whatsapp')
      setInstances(data.instances)
    } finally { setLoading(false) }
  }

  async function createInstance() {
    if (!newName.trim()) return
    setCreating(true)
    setErrorMsg(null)
    try {
      const data = await apiFetch<{ instance: Instance; qrcode?: any }>('/api/whatsapp', {
        method: 'POST',
        body: { instanceName: newName.trim() },
      })
      if (data.qrcode?.base64) {
        setQrData(data.qrcode.base64)
      }
      setShowAdd(false)
      setNewName('')
      loadInstances()
    } catch (err: any) {
      const msg = err?.message || String(err)
      setErrorMsg(
        /ECONNREFUSED|fetch failed|Evolution/i.test(msg)
          ? `Evolution API bağlantısı kurulamadı. Server tarafında Evolution API kurulu değil veya EVOLUTION_API_URL yanlış. Detay: ${msg}`
          : `Instance oluşturulamadı: ${msg}`
      )
    } finally {
      setCreating(false)
    }
  }

  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    connected: { icon: <Wifi className="w-4 h-4" />, color: 'text-green-400', label: 'Connected' },
    disconnected: { icon: <WifiOff className="w-4 h-4" />, color: 'text-red-400', label: 'Disconnected' },
    connecting: { icon: <RefreshCw className="w-4 h-4 animate-spin" />, color: 'text-amber-400', label: 'Connecting' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">WhatsApp Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage WhatsApp connections</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/80">
          <Plus className="w-4 h-4" /> New Instance
        </button>
      </div>

      {showAdd && (
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Instance Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="my-business" className="w-full h-9 px-3 bg-muted/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <button onClick={createInstance} disabled={creating} className="h-9 px-4 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {creating ? 'Creating...' : 'Create & Connect'}
            </button>
          </div>
          {errorMsg && (
            <div className="text-xs p-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
              {errorMsg}
            </div>
          )}
        </div>
      )}

      {/* QR Code modal */}
      {qrData && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <QrCode className="w-6 h-6 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-3">Scan QR Code with WhatsApp</h3>
          <img src={`data:image/png;base64,${qrData}`} alt="QR Code" className="mx-auto w-64 h-64 rounded-xl" />
          <button onClick={() => setQrData(null)} className="mt-4 px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>
      )}

      {/* Instances */}
      <div className="space-y-3">
        {instances.map(instance => {
          const status = statusConfig[instance.status] || statusConfig.disconnected
          return (
            <div key={instance.id} className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-green-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{instance.instanceName}</span>
                  <span className={cn('flex items-center gap-1 text-xs', status.color)}>
                    {status.icon} {status.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {instance.phoneNumber && <span>{instance.phoneNumber}</span>}
                  {instance.lastConnectedAt && <span>Last connected: {format(new Date(instance.lastConnectedAt), 'dd MMM HH:mm')}</span>}
                </div>
              </div>
              <button onClick={loadInstances} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )
        })}
        {!loading && instances.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No WhatsApp instances. Create one to get started.
          </div>
        )}
      </div>
    </div>
  )
}
