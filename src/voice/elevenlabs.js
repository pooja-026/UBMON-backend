// Thin wrapper around the ElevenLabs REST API. The API key never leaves the backend.
const BASE_URL = 'https://api.elevenlabs.io/v1'
const REQUEST_TIMEOUT_MS = 20000

export class ElevenLabsError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ElevenLabsError'
    this.status = status
  }
}

export function createElevenLabsClient({ apiKey, fetchImpl = globalThis.fetch }) {
  async function request(path, { method = 'GET', body, accept = 'application/json' } = {}) {
    const headers = { 'xi-api-key': apiKey, Accept: accept }
    if (body) headers['Content-Type'] = 'application/json'

    const res = await fetchImpl(BASE_URL + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      // Log the path only: never include query strings or signed URLs.
      throw new ElevenLabsError(
        `ElevenLabs ${method} ${path.split('?')[0]} failed with ${res.status}: ${detail.slice(0, 500)}`,
        res.status,
      )
    }
    return res
  }

  return {
    /** Returns MP3 audio as a Buffer. */
    async textToSpeech({ text, voiceId, modelId }) {
      const res = await request(
        `/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`,
        { method: 'POST', body: { text, model_id: modelId }, accept: 'audio/mpeg' },
      )
      return Buffer.from(await res.arrayBuffer())
    },

    /** Signed WebSocket URL for one agent conversation. */
    async getSignedUrl(agentId) {
      const res = await request(
        `/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      )
      return (await res.json()).signed_url
    },

    /** Short-lived WebRTC token the browser uses to start a voice session. */
    async getConversationToken(agentId) {
      const res = await request(
        `/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      )
      return (await res.json()).token
    },

    async createAgent(body) {
      const res = await request('/convai/agents/create', { method: 'POST', body })
      return (await res.json()).agent_id
    },

    async updateAgent(agentId, body) {
      await request(`/convai/agents/${encodeURIComponent(agentId)}`, { method: 'PATCH', body })
    },
  }
}
