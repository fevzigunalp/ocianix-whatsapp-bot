const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''

/**
 * Public URL Evolution uses to POST webhooks to this app.
 * Prefers PUBLIC_WEBHOOK_URL so webhook traffic can be routed through a
 * dedicated subdomain; falls back to NEXT_PUBLIC_APP_URL.
 */
export function publicWebhookUrl(): string {
  const base = (process.env.PUBLIC_WEBHOOK_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')
  return base ? `${base}/api/webhook/evolution` : ''
}

async function evolutionFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${EVOLUTION_URL}${path}`
  console.log('[Evolution]', options.method || 'GET', path)

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[Evolution] Error', res.status, text.substring(0, 200))
    throw new Error(`Evolution API ${res.status}: ${text.substring(0, 200)}`)
  }

  return res.json()
}

export const evolutionAPI = {
  /**
   * Fetch all instances with their status
   */
  async listInstances(): Promise<Array<{
    instanceName: string
    instanceId: string
    owner: string | null
    profileName: string | null
    status: string
  }>> {
    const raw = await evolutionFetch('/instance/fetchInstances')
    // v1.8.x wraps each in { instance: {...} }
    return raw.map((item: any) => {
      const inst = item.instance || item
      return {
        instanceName: inst.instanceName || inst.name,
        instanceId: inst.instanceId || inst.id,
        owner: inst.owner || inst.ownerJid || null,
        profileName: inst.profileName || null,
        status: inst.status === 'open' ? 'connected' :
                inst.status === 'close' ? 'disconnected' :
                inst.status === 'connecting' ? 'connecting' : inst.status,
      }
    })
  },

  async getConnectionState(instanceName: string): Promise<string> {
    const data = await evolutionFetch(`/instance/connectionState/${instanceName}`)
    const state = data?.instance?.state || data?.state
    if (state === 'open') return 'connected'
    if (state === 'close') return 'disconnected'
    return state || 'disconnected'
  },

  async createInstance(instanceName: string) {
    return evolutionFetch('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        qrcode: true,
      }),
    })
  },

  async connectInstance(instanceName: string) {
    return evolutionFetch(`/instance/connect/${instanceName}`)
  },

  async deleteInstance(instanceName: string) {
    return evolutionFetch(`/instance/delete/${instanceName}`, { method: 'DELETE' })
  },

  async setWebhook(instanceName: string, url: string) {
    return evolutionFetch(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        enabled: true,
        url,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      }),
    })
  },

  /**
   * Send text message — v1.8.x format uses textMessage wrapper
   */
  async sendText(instanceName: string, number: string, text: string) {
    console.log('[Evolution] sendText to', number, 'via', instanceName)
    return evolutionFetch(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        textMessage: { text },
      }),
    })
  },

  async sendMedia(instanceName: string, params: {
    number: string
    mediatype: 'image' | 'video' | 'audio' | 'document'
    media: string
    caption?: string
    fileName?: string
  }) {
    return evolutionFetch(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },
}
