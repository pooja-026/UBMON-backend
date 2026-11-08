import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { askTextAgent } from '../src/voice/agentConversation.js'
import { normalizeContent } from '../src/voice/content.js'
import { arrivalText, fallbackText } from '../src/voice/narration.js'
import { guideAgentBody, narratorAgentBody, narratorPrompt } from '../src/voice/prompts.js'
import { createVoiceService } from '../src/voice/service.js'

const STOP = { id: 'mock-a', name: 'Student Union', fact: 'It is at 50 Lee Road.' }
const GREETINGS = ['Hey Bull, you reached {stop}! Congratulations.', 'Nice work, Bull! You made it to {stop}.']
const CONTENT = normalizeContent({
  welcome: 'Welcome, Bull!',
  guideGreeting: 'Hi from the guide.',
  arrivalGreetings: GREETINGS,
  facts: { general: ['UB fact one'], byStop: { 'mock-a': ['Extra fact'] } },
  jokes: ['A kind joke.', 'TODO: placeholder joke'],
})

// ---- Helpers ----

function fakeClient(overrides = {}) {
  const calls = []
  return {
    calls,
    async getSignedUrl(agentId) {
      calls.push(['getSignedUrl', agentId])
      return 'wss://signed.example'
    },
    async textToSpeech(args) {
      calls.push(['textToSpeech', args])
      return Buffer.from('mp3-bytes')
    },
    async getConversationToken(agentId) {
      calls.push(['getConversationToken', agentId])
      return 'token-123'
    },
    ...overrides,
  }
}

const fullConfig = {
  apiKey: 'key',
  voiceId: 'voice',
  ttsModel: 'eleven_flash_v2_5',
  narratorAgentId: 'narrator',
  guideAgentId: 'guide',
}

async function startServer(voiceService) {
  const server = createApp({ voiceService }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  return { server, base: `http://localhost:${server.address().port}/api/voice` }
}

const postNarration = (base, body) =>
  fetch(`${base}/narration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

// ---- Narration text ----

describe('narration text', () => {
  test('arrival greets the player and reads the stop fact', () => {
    assert.equal(
      arrivalText(STOP, GREETINGS, () => 0),
      'Hey Bull, you reached Student Union! Congratulations. It is at 50 Lee Road.',
    )
  })

  test('arrival skips placeholder facts', () => {
    const text = arrivalText({ ...STOP, fact: 'TODO: add a fact' }, GREETINGS, () => 0)
    assert.equal(text, 'Hey Bull, you reached Student Union! Congratulations.')
  })

  test('narrator prompt only includes usable facts', () => {
    const prompt = narratorPrompt(
      CONTENT,
      [STOP, { id: 'mock-b', name: 'Capen Hall', fact: 'MOCK fact.' }],
    )
    assert.match(prompt, /UB fact one/)
    assert.match(prompt, /Student Union \(id: mock-a\): It is at 50 Lee Road\. Extra fact/)
    assert.match(prompt, /Capen Hall \(id: mock-b\): \(no facts yet\)/)
    assert.doesNotMatch(prompt, /MOCK fact/)
    assert.match(prompt, /- A kind joke./)
    assert.doesNotMatch(prompt, /placeholder joke/)
  })

  test('facts for places that are not stops are listed as other landmarks', () => {
    const content = normalizeContent({ facts: { byStop: { 'capen-hall': ['Named after Capen.'] } } })
    const prompt = narratorPrompt(content, [STOP])
    assert.match(prompt, /Other campus landmarks:\n- capen hall: Named after Capen\./)
  })

  test('facts can carry a source; only the text is kept', () => {
    const c = normalizeContent({
      facts: { general: [{ text: 'Sourced fact.', source: 'https://www.buffalo.edu/x' }, 'Plain fact.'] },
    })
    assert.deepEqual(c.facts.general, ['Sourced fact.', 'Plain fact.'])
  })

  test('content falls back to defaults for placeholders', () => {
    const c = normalizeContent({ welcome: 'TODO', arrivalGreetings: ['TODO: x'] })
    assert.match(c.welcome, /Welcome to Campus Dash/)
    assert.equal(c.arrivalGreetings.length, 1)
    assert.deepEqual(c.jokes, [])
  })

  test('guide agent opens with the guide greeting', () => {
    const body = guideAgentBody({ content: CONTENT, stops: [STOP], llm: 'x', voiceId: 'v' })
    assert.equal(body.conversation_config.agent.first_message, 'Hi from the guide.')
  })

  test('narrator agent is text only', () => {
    const body = narratorAgentBody({
      content: CONTENT,
      stops: [STOP],
      llm: 'claude-haiku-5-5',
      voiceId: 'voice',
    })
    assert.equal(body.conversation_config.conversation.text_only, true)
    assert.equal(body.conversation_config.agent.prompt.llm, 'claude-haiku-5-5')
  })
})

// ---- Voice service ----

describe('voice service', () => {
  test('arrival uses the template and does not call the agent', async () => {
    const client = fakeClient()
    let agentCalled = false
    const service = createVoiceService({
      config: fullConfig,
      content: CONTENT,
      client,
      askAgent: async () => {
        agentCalled = true
      },
      random: () => 0,
    })
    const { text, audio } = await service.narrate('arrival', STOP)
    assert.match(text, /^Hey Bull, you reached Student Union!/)
    assert.equal(audio.toString(), 'mp3-bytes')
    assert.equal(agentCalled, false)
  })

  test('welcome speaks the welcome note without a stop', async () => {
    const service = createVoiceService({ config: fullConfig, content: CONTENT, client: fakeClient() })
    const { text } = await service.narrate('welcome', null)
    assert.equal(text, 'Welcome, Bull!')
  })

  test('leg-start asks the narrator agent and speaks its reply', async () => {
    const client = fakeClient()
    const service = createVoiceService({
      config: fullConfig,
      content: CONTENT,
      client,
      askAgent: async (url, message) => {
        assert.equal(url, 'wss://signed.example')
        assert.match(message, /leg-start/)
        return 'Off you go, Bull!'
      },
    })
    const { text } = await service.narrate('leg-start', STOP)
    assert.equal(text, 'Off you go, Bull!')
    const tts = client.calls.find(([name]) => name === 'textToSpeech')[1]
    assert.deepEqual(tts, { text: 'Off you go, Bull!', voiceId: 'voice', modelId: 'eleven_flash_v2_5' })
  })

  test('falls back to a stock line when the agent fails', async (t) => {
    t.mock.method(console, 'error', () => {})
    const service = createVoiceService({
      config: fullConfig,
      content: CONTENT,
      client: fakeClient(),
      askAgent: async () => {
        throw new Error('boom')
      },
    })
    const { text } = await service.narrate('midpoint', STOP)
    assert.equal(text, fallbackText('midpoint', STOP))
  })
})

// ---- Routes ----

describe('voice routes (configured)', () => {
  let server
  let base
  before(async () => {
    ;({ server, base } = await startServer(
      createVoiceService({ config: fullConfig, content: CONTENT, client: fakeClient(), askAgent: async () => 'Hi Bull!' }),
    ))
  })
  after(() => server.close())

  test('GET / lists the voice endpoints', async () => {
    const res = await fetch(base)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(
      body.endpoints.map((e) => e.path),
      ['/api/voice/status', '/api/voice/narration', '/api/voice/place-info', '/api/voice/quiz/question', '/api/voice/quiz/reaction', '/api/voice/guide/token'],
    )
  })

  test('GET /status', async () => {
    const res = await fetch(`${base}/status`)
    assert.deepEqual(await res.json(), { narration: true, narratorAgent: true, placeAgent: false, guide: true })
  })

  test('POST /narration returns mp3 with the spoken text', async () => {
    const res = await postNarration(base, { event: 'leg-start', stopId: 'mock-a' })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'audio/mpeg')
    assert.equal(decodeURIComponent(res.headers.get('x-voice-text')), 'Hi Bull!')
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), 'mp3-bytes')
  })

  test('POST /narration validates input', async () => {
    assert.equal((await postNarration(base, { event: 'dance', stopId: 'mock-a' })).status, 400)
    assert.equal((await postNarration(base, { event: 'arrival', stopId: 'nope' })).status, 404)
    assert.equal((await postNarration(base, { event: 'midpoint' })).status, 404)
  })

  test('POST /narration welcome needs no stopId', async () => {
    const res = await postNarration(base, { event: 'welcome' })
    assert.equal(res.status, 200)
    assert.equal(decodeURIComponent(res.headers.get('x-voice-text')), 'Welcome, Bull!')
  })

  test('GET /guide/token', async () => {
    const res = await fetch(`${base}/guide/token`)
    assert.deepEqual(await res.json(), { conversationToken: 'token-123' })
  })
})

describe('voice routes (not configured)', () => {
  let server
  let base
  before(async () => {
    ;({ server, base } = await startServer(
      createVoiceService({ config: { apiKey: '', voiceId: '' }, content: CONTENT, client: fakeClient() }),
    ))
  })
  after(() => server.close())

  test('returns 503 instead of calling ElevenLabs', async () => {
    assert.equal((await postNarration(base, { event: 'arrival', stopId: 'mock-a' })).status, 503)
    assert.equal((await fetch(`${base}/guide/token`)).status, 503)
  })
})

describe('voice routes (ElevenLabs down)', () => {
  let server
  let base
  before(async () => {
    ;({ server, base } = await startServer(
      createVoiceService({
        config: fullConfig,
        content: CONTENT,
        client: fakeClient({
          textToSpeech: async () => {
            throw new Error('ElevenLabs down')
          },
        }),
      }),
    ))
  })
  after(() => server.close())

  test('returns a friendly 502 without leaking details', async (t) => {
    t.mock.method(console, 'error', () => {})
    const res = await postNarration(base, { event: 'arrival', stopId: 'mock-a' })
    assert.equal(res.status, 502)
    assert.deepEqual(await res.json(), { error: 'Voice is not available right now' })
  })
})

// ---- Agent WebSocket protocol ----

class FakeSocket extends EventTarget {
  static last
  constructor(url) {
    super()
    this.url = url
    this.sent = []
    FakeSocket.last = this
    queueMicrotask(() => this.dispatchEvent(new Event('open')))
  }
  send(data) {
    this.sent.push(JSON.parse(data))
  }
  close() {}
  receive(msg) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(msg) }))
  }
}

describe('askTextAgent', () => {
  test('sends init + user_message, answers ping, resolves on agent_response', async () => {
    const reply = askTextAgent('wss://x', 'EVENT: leg-start', { WebSocketImpl: FakeSocket })
    await new Promise((r) => setTimeout(r, 0))
    const ws = FakeSocket.last
    assert.deepEqual(ws.sent, [
      { type: 'conversation_initiation_client_data' },
      { type: 'user_message', text: 'EVENT: leg-start' },
    ])
    ws.receive({ type: 'ping', ping_event: { event_id: 7 } })
    assert.deepEqual(ws.sent.at(-1), { type: 'pong', event_id: 7 })
    ws.receive({ type: 'agent_response', agent_response_event: { agent_response: ' Go, Bull! ' } })
    assert.equal(await reply, 'Go, Bull!')
  })

  test('resolves from streamed text parts', async () => {
    const reply = askTextAgent('wss://x', 'hi', { WebSocketImpl: FakeSocket })
    await new Promise((r) => setTimeout(r, 0))
    const ws = FakeSocket.last
    ws.receive({ type: 'agent_chat_response_part', text_response_part: { type: 'start', text: '' } })
    ws.receive({ type: 'agent_chat_response_part', text_response_part: { type: 'delta', text: 'Hello ' } })
    ws.receive({ type: 'agent_chat_response_part', text_response_part: { type: 'delta', text: 'Bull' } })
    ws.receive({ type: 'agent_chat_response_part', text_response_part: { type: 'stop' } })
    assert.equal(await reply, 'Hello Bull')
  })

  test('times out if the agent never replies', async () => {
    await assert.rejects(
      askTextAgent('wss://x', 'hi', { WebSocketImpl: FakeSocket, timeoutMs: 20 }),
      /did not reply in time/,
    )
  })
})
