import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

let server
let base

before(async () => {
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://localhost:${server.address().port}/api`
})

after(() => server.close())

test('CORS allows every origin in the CORS_ORIGIN list', async () => {
  const previous = process.env.CORS_ORIGIN
  process.env.CORS_ORIGIN = 'http://localhost:5173, https://campus-dash.vercel.app'
  const app = createApp({ voiceService: { status: () => ({}) } }).listen(0)
  await new Promise((resolve) => app.once('listening', resolve))
  const url = `http://localhost:${app.address().port}/api/health`
  try {
    const allowed = await fetch(url, { headers: { Origin: 'https://campus-dash.vercel.app' } })
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://campus-dash.vercel.app')
    const blocked = await fetch(url, { headers: { Origin: 'https://evil.example' } })
    assert.equal(blocked.headers.get('access-control-allow-origin'), null)
  } finally {
    app.close()
    if (previous === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = previous
  }
})

test('GET /health', async () => {
  const res = await fetch(`${base}/health`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'ok' })
})

test('GET /stops returns all stops', async () => {
  const stops = await (await fetch(`${base}/stops`)).json()
  assert.ok(stops.length > 0)
  assert.ok(stops[0].id && stops[0].creatureId)
})

test('GET /stops/:id returns 404 for unknown id', async () => {
  const res = await fetch(`${base}/stops/nope`)
  assert.equal(res.status, 404)
})

test('GET /creatures hides answerIndex', async () => {
  const creatures = await (await fetch(`${base}/creatures`)).json()
  assert.ok(creatures.length > 0)
  for (const c of creatures) assert.equal(c.question.answerIndex, undefined)
})

test('POST /creatures/:id/answer checks answers', async () => {
  const post = (body) =>
    fetch(`${base}/creatures/mock-creature-a/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  assert.deepEqual(await (await post({ answerIndex: 0 })).json(), { correct: true })
  assert.deepEqual(await (await post({ answerIndex: 1 })).json(), { correct: false })
  assert.equal((await post({ answerIndex: 99 })).status, 400)
  assert.equal((await post({})).status, 400)
})

test('GET /voice-test serves the developer page', async () => {
  const res = await fetch(`${base.replace('/api', '')}/voice-test`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /Campus Dash voice test/)
})
