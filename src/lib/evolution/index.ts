const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080'
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || ''

interface EvolutionResponse {
  instance?: any
  qrcode?: { base64: string }
  key?: { id: string }
  status?: string
  error?: string
}

async function evolutionFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${EVOLUTION_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Evolution API error ${res.status}: ${text}`)
  }
  return res.json()
}

export const evolutionAPI = {
  // Instance management
  async createInstance(instanceName: string) {
    return evolutionFetch('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/evolution`,
        webhookByEvents: false,
        webhookBase64: false,
        webhookEvents: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
        ],
      }),
    })
  },

  async getInstanceStatus(instanceName: string) {
    return evolutionFetch(`/instance/connectionState/${instanceName}`)
  },

  async getQrCode(instanceName: string) {
    return evolutionFetch(`/instance/connect/${instanceName}`)
  },

  async deleteInstance(instanceName: string) {
    return evolutionFetch(`/instance/delete/${instanceName}`, { method: 'DELETE' })
  },

  async listInstances() {
    return evolutionFetch('/instance/fetchInstances')
  },

  // Messaging
  async sendText(instanceName: string, number: string, text: string) {
    return evolutionFetch(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        text,
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

  async sendDocument(instanceName: string, number: string, media: string, fileName: string, caption?: string) {
    return evolutionFetch(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        mediatype: 'document',
        media,
        fileName,
        caption: caption || '',
      }),
    })
  },

  // Webhook configuration
  async setWebhook(instanceName: string, url: string) {
    return evolutionFetch(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        enabled: true,
        url,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
        ],
      }),
    })
  },
}
