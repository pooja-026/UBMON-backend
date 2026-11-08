// Sends one text message to a text-only ElevenLabs agent and resolves with its reply.
// Agent WebSocket protocol: send conversation_initiation_client_data, then user_message;
// answer ping events with pong; read agent_chat_response_part / agent_response.
export function askTextAgent(
  signedUrl,
  message,
  { timeoutMs = 15000, WebSocketImpl = globalThis.WebSocket } = {},
) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(signedUrl)
    let streamed = ''
    let settled = false

    const finish = (error, text) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // already closed
      }
      if (error) reject(error)
      else resolve(text)
    }

    const timer = setTimeout(() => finish(new Error('Agent did not reply in time')), timeoutMs)
    const send = (payload) => ws.send(JSON.stringify(payload))

    ws.addEventListener('open', () => {
      send({ type: 'conversation_initiation_client_data' })
      send({ type: 'user_message', text: message })
    })

    ws.addEventListener('message', (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      switch (msg.type) {
        case 'ping':
          send({ type: 'pong', event_id: msg.ping_event?.event_id })
          break
        // Streamed text (always sent in text-only mode).
        case 'agent_chat_response_part': {
          const part = msg.text_response_part
          if (!part) break
          if (part.type === 'stop') {
            if (streamed.trim()) finish(null, streamed.trim())
          } else {
            streamed += part.text ?? ''
          }
          break
        }
        // Full reply once the turn is finished.
        case 'agent_response': {
          const text = msg.agent_response_event?.agent_response?.trim()
          if (text) finish(null, text)
          break
        }
      }
    })

    ws.addEventListener('error', () => finish(new Error('Agent connection failed')))
    ws.addEventListener('close', (event) =>
      finish(new Error(`Agent connection closed before replying (code ${event.code})`)),
    )
  })
}
