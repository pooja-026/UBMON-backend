import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { creatures } from '../src/data/index.js'
import { loadVoiceContent, normalizeContent } from '../src/voice/content.js'
import { hasQuiz, quizQuestionText, quizReactionText } from '../src/voice/quiz.js'
import { createVoiceService } from '../src/voice/service.js'

const CREATURE = {
  id: 'c1',
  name: 'Sparky',
  question: { text: 'What is on the sign?', options: ['A cafe.', 'A gym', 'A pool?'], answerIndex: 0 },
}
const CONTENT = normalizeContent({
  quizIntros: ['{creature} appeared!'],
  quizReactions: { correct: ['Got {creature}!'], retry: ['Try again.'], ranAway: ['{creature} ran away.'] },
})

describe('quiz text', () => {
  test('reads intro, question and numbered options, then asks to tap', () => {
    assert.equal(
      quizQuestionText(CREATURE, CONTENT.quizIntros, () => 0),
      'Sparky appeared! What is on the sign? Option one: A cafe. Option two: A gym. Option three: A pool. Tap your answer.',
    )
  })

  test('never mentions which option is correct', () => {
    const text = quizQuestionText(CREATURE, CONTENT.quizIntros, () => 0)
    assert.doesNotMatch(text, /answer is|correct/i)
  })

  test('reactions fill in the creature name', () => {
    assert.equal(quizReactionText('correct', CREATURE, CONTENT.quizReactions, () => 0), 'Got Sparky!')
    assert.equal(quizReactionText('retry', CREATURE, CONTENT.quizReactions, () => 0), 'Try again.')
    assert.equal(quizReactionText('ran-away', CREATURE, CONTENT.quizReactions, () => 0), 'Sparky ran away.')
  })

  test('defaults cover missing quiz lines', () => {
    const c = normalizeContent({})
    assert.ok(c.quizIntros.length && c.quizReactions.correct.length && c.quizReactions.ranAway.length)
  })

  test('the real content file has quiz lines', () => {
    const c = loadVoiceContent()
    assert.ok(c.quizIntros.length >= 1)
    assert.ok(c.quizReactions.retry.length >= 1)
  })

  test('hasQuiz needs a question and at least two options', () => {
    assert.equal(hasQuiz(CREATURE), true)
    assert.equal(hasQuiz({ question: { text: 'Q', options: ['only one'] } }), false)
    assert.equal(hasQuiz({}), false)
  })
})

describe('quiz routes', () => {
  let server
  let base
  const spoken = []
  before(async () => {
    const voiceService = createVoiceService({
      config: { apiKey: 'k', voiceId: 'v', ttsModel: 'm' },
      content: CONTENT,
      random: () => 0,
      client: {
        textToSpeech: async ({ text }) => {
          spoken.push(text)
          return Buffer.from('mp3')
        },
      },
    })
    server = createApp({ voiceService }).listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://localhost:${server.address().port}/api/voice/quiz`
  })
  after(() => server.close())

  const post = (path, body) =>
    fetch(`${base}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const realCreature = creatures[0]

  test('question: reads the real creature question without the answer', async () => {
    const res = await post('question', { creatureId: realCreature.id })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'audio/mpeg')
    const text = decodeURIComponent(res.headers.get('x-voice-text'))
    assert.match(text, new RegExp(realCreature.question.text.replace(/[?]/g, '\\?')))
    assert.match(text, /Option three/)
    assert.match(text, /Tap your answer\.$/)
  })

  test('reaction: speaks for each outcome', async () => {
    for (const outcome of ['correct', 'retry', 'ran-away']) {
      const res = await post('reaction', { creatureId: realCreature.id, outcome })
      assert.equal(res.status, 200, outcome)
    }
    assert.match(spoken.at(-1), /ran away/)
  })

  test('validates input', async () => {
    assert.equal((await post('question', { creatureId: 'nope' })).status, 404)
    assert.equal((await post('reaction', { creatureId: realCreature.id, outcome: 'maybe' })).status, 400)
    assert.equal((await post('reaction', { creatureId: 'nope', outcome: 'correct' })).status, 404)
  })
})
