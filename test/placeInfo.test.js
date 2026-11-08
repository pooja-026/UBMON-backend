import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createApp } from '../src/app.js'
import { normalizeContent } from '../src/voice/content.js'
import {
  detectIntent,
  loadPlace,
  notesFor,
  placeAgentBody,
  placeAgentMessage,
} from '../src/voice/placeInfo.js'
import { createVoiceService } from '../src/voice/service.js'

const CAPEN = {
  name: 'Capen Hall',
  about: ['Capen Hall is named after Samuel P. Capen.'],
  orientation: ['The libraries are on the lower floors.'],
}

describe('intent detection', () => {
  for (const text of ['orient me about this', 'what is inside?', 'Where is the library here', 'which floor', 'help me find my way around']) {
    test(`"${text}" -> orient`, () => assert.equal(detectIntent(text), 'orient'))
  }
  for (const text of ['tell about this hall', 'what is this building?', 'tell me something cool']) {
    test(`"${text}" -> about`, () => assert.equal(detectIntent(text), 'about'))
  }
})

describe('place file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'place-info-'))
  const file = pathToFileURL(join(dir, 'place-info.json'))
  writeFileSync(
    file,
    JSON.stringify({
      _note: 'x',
      'capen-hall': { name: 'Capen Hall', about: ['A fact.', 'TODO: later'], orientation: ['TODO: x'] },
      'empty-hall': { name: 'Empty', about: ['TODO: x'] },
    }),
  )

  test('drops TODO entries and returns the place', () => {
    assert.deepEqual(loadPlace('capen-hall', file), { name: 'Capen Hall', about: ['A fact.'], orientation: [] })
  })

  test('returns null for unknown, placeholder-only and _note keys', () => {
    assert.equal(loadPlace('nope', file), null)
    assert.equal(loadPlace('empty-hall', file), null)
    assert.equal(loadPlace('_note', file), null)
    assert.equal(loadPlace('constructor', file), null)
  })

  test('falls back to the other section when the asked one is empty', () => {
    const place = { name: 'X', about: ['About.'], orientation: [] }
    assert.deepEqual(notesFor(place, 'orient'), ['About.'])
    assert.deepEqual(notesFor(CAPEN, 'orient'), ['The libraries are on the lower floors.'])
  })
})

describe('place agent', () => {
  test('message carries intent, place, words and notes', () => {
    const msg = placeAgentMessage({ intent: 'about', place: CAPEN, notes: CAPEN.about, text: 'tell about "this"' })
    assert.equal(
      msg,
      "REQUEST: about\nPLACE: Capen Hall\nPLAYER SAID: \"tell about 'this'\"\nNOTES:\n- Capen Hall is named after Samuel P. Capen.",
    )
  })

  test('agent is text only and uses the configured LLM', () => {
    const body = placeAgentBody({ llm: 'gemini-2.5-flash', voiceId: 'v' })
    assert.equal(body.conversation_config.conversation.text_only, true)
    assert.equal(body.conversation_config.agent.prompt.llm, 'gemini-2.5-flash')
  })
})

// ---- Route ----

function fakeClient() {
  return {
    getSignedUrl: async () => 'wss://signed',
    textToSpeech: async () => Buffer.from('mp3'),
    getConversationToken: async () => 't',
  }
}

const config = { apiKey: 'k', voiceId: 'v', ttsModel: 'm', placeAgentId: 'place-agent' }

describe('POST /api/voice/place-info', () => {
  let server
  let url
  let lastAgentMessage
  before(async () => {
    const voiceService = createVoiceService({
      config,
      content: normalizeContent({}),
      client: fakeClient(),
      askAgent: async (signedUrl, message) => {
        lastAgentMessage = message
        return 'Welcome to Capen Hall, Bull!'
      },
    })
    const loadPlace = (id) => (id === 'capen-hall' ? CAPEN : null)
    server = createApp({ voiceService, loadPlace }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    url = `http://localhost:${server.address().port}/api/voice/place-info`
  })
  after(() => server.close())

  const post = (body) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  test('about: speaks the rewritten info', async () => {
    const res = await post({ text: 'tell about this hall', stopId: 'capen-hall' })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'audio/mpeg')
    assert.equal(res.headers.get('x-place-intent'), 'about')
    assert.equal(decodeURIComponent(res.headers.get('x-voice-text')), 'Welcome to Capen Hall, Bull!')
    assert.match(lastAgentMessage, /REQUEST: about[\s\S]*named after Samuel P\. Capen/)
  })

  test('orient: sends the orientation notes', async () => {
    const res = await post({ text: 'orient me about this', stopId: 'capen-hall' })
    assert.equal(res.headers.get('x-place-intent'), 'orient')
    assert.match(lastAgentMessage, /REQUEST: orient[\s\S]*lower floors/)
  })

  test('validates input', async () => {
    assert.equal((await post({ stopId: 'capen-hall' })).status, 400)
    assert.equal((await post({ text: 'x'.repeat(301), stopId: 'capen-hall' })).status, 400)
    assert.equal((await post({ text: 'tell me' })).status, 400)
    assert.equal((await post({ text: 'tell me', stopId: 'nope' })).status, 404)
  })
})

describe('place info fallback', () => {
  test('reads the notes as written when the agent fails', async (t) => {
    t.mock.method(console, 'error', () => {})
    const service = createVoiceService({
      config,
      content: normalizeContent({}),
      client: fakeClient(),
      askAgent: async () => {
        throw new Error('down')
      },
    })
    const { text } = await service.describePlace({ intent: 'about', place: CAPEN, text: 'tell me' })
    assert.equal(text, 'Here is Capen Hall, Bull. Capen Hall is named after Samuel P. Capen.')
  })
})
