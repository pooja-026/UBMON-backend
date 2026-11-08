import { Router } from 'express'
import { creatures, stops } from '../data/index.js'
import { NARRATION_EVENTS, STOP_EVENTS } from '../voice/narration.js'
import { detectIntent, loadPlace as loadPlaceFromFile } from '../voice/placeInfo.js'
import { QUIZ_OUTCOMES, hasQuiz } from '../voice/quiz.js'

const MAX_TEXT_LENGTH = 300

function sendAudio(res, { text, audio }, extraHeaders = {}) {
  res
    .set('Content-Type', 'audio/mpeg')
    .set('Cache-Control', 'no-store')
    .set('X-Voice-Text', encodeURIComponent(text))
    .set(extraHeaders)
    .send(audio)
}

export function createVoiceRouter({ service, loadPlace = loadPlaceFromFile }) {
  const router = Router()

  // GET /api/voice -> list of voice endpoints (handy when opened in a browser)
  router.get('/', (req, res) => {
    res.json({
      service: 'campusDash voice API',
      docs: 'backend/FRONTEND_HANDOFF.md',
      endpoints: [
        { method: 'GET', path: '/api/voice/status', description: 'Which voice features are configured' },
        {
          method: 'POST',
          path: '/api/voice/narration',
          body: {
            event: NARRATION_EVENTS.join(' | '),
            stopId: `string (required for ${STOP_EVENTS.join(', ')})`,
          },
          description: 'Spoken line as audio/mpeg; text in the X-Voice-Text header',
        },
        {
          method: 'POST',
          path: '/api/voice/place-info',
          body: { text: 'what the player said, e.g. "tell me about this hall"', stopId: 'string' },
          description:
            'Spoken info about the place from place-info.json as audio/mpeg; text in X-Voice-Text, intent (about | orient) in X-Place-Intent',
        },
        {
          method: 'POST',
          path: '/api/voice/quiz/question',
          body: { creatureId: 'string' },
          description: 'Reads the creature question and options aloud (never the answer); audio/mpeg',
        },
        {
          method: 'POST',
          path: '/api/voice/quiz/reaction',
          body: { creatureId: 'string', outcome: QUIZ_OUTCOMES.join(' | ') },
          description: 'Spoken reaction to an answer the game already checked; audio/mpeg',
        },
        { method: 'GET', path: '/api/voice/guide/token', description: 'Short-lived token for the two-way voice guide' },
      ],
    })
  })

  // GET /api/voice/status -> which voice features are configured
  router.get('/status', (req, res) => {
    res.json(service.status())
  })

  // POST /api/voice/narration
  // body: { "event": "welcome" | "leg-start" | "midpoint" | "arrival", "stopId": "..." }
  // stopId is required for every event except "welcome".
  // Responds with audio/mpeg. The spoken text is in the X-Voice-Text header (URI-encoded).
  router.post('/narration', async (req, res) => {
    const { event, stopId } = req.body ?? {}
    if (!NARRATION_EVENTS.includes(event)) {
      return res.status(400).json({ error: `event must be one of: ${NARRATION_EVENTS.join(', ')}` })
    }
    let stop = null
    if (STOP_EVENTS.includes(event)) {
      stop = stops.find((s) => s.id === stopId)
      if (!stop) return res.status(404).json({ error: 'Stop not found' })
    }
    if (!service.status().narration) {
      return res.status(503).json({ error: 'Voice is not set up yet' })
    }

    try {
      sendAudio(res, await service.narrate(event, stop))
    } catch (err) {
      console.error('Narration failed:', err)
      res.status(502).json({ error: 'Voice is not available right now' })
    }
  })

  // POST /api/voice/place-info
  // body: { "text": "tell me about this hall", "stopId": "capen" }
  // The stopId is the place the player is at ("this hall"). The text decides the intent:
  // orientation words ("orient", "inside", "where", "floor"...) -> orient, otherwise about.
  // Responds with audio/mpeg. Headers: X-Voice-Text (spoken text), X-Place-Intent.
  router.post('/place-info', async (req, res) => {
    const { text, stopId } = req.body ?? {}
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `text must be 1 to ${MAX_TEXT_LENGTH} characters` })
    }
    if (typeof stopId !== 'string' || !stopId.trim()) {
      return res.status(400).json({ error: 'stopId is required' })
    }

    let place
    try {
      place = loadPlace(stopId.trim())
    } catch (err) {
      console.error('Could not read place-info.json:', err)
      return res.status(500).json({ error: 'Place info is not available right now' })
    }
    if (!place) return res.status(404).json({ error: 'No info for this place yet' })
    if (!service.status().narration) {
      return res.status(503).json({ error: 'Voice is not set up yet' })
    }

    const intent = detectIntent(text)
    try {
      const result = await service.describePlace({ intent, place, text: text.trim() })
      sendAudio(res, result, { 'X-Place-Intent': intent })
    } catch (err) {
      console.error('Place info failed:', err)
      res.status(502).json({ error: 'Voice is not available right now' })
    }
  })

  // Shared checks for the quiz endpoints. Returns the creature, or null after sending an error.
  function quizCreature(req, res) {
    const { creatureId } = req.body ?? {}
    const creature = creatures.find((c) => c.id === creatureId)
    if (!creature) {
      res.status(404).json({ error: 'Creature not found' })
      return null
    }
    if (!hasQuiz(creature)) {
      res.status(404).json({ error: 'This creature has no question yet' })
      return null
    }
    if (!service.status().narration) {
      res.status(503).json({ error: 'Voice is not set up yet' })
      return null
    }
    return creature
  }

  // POST /api/voice/quiz/question  body: { "creatureId": "..." }
  // Reads the question and numbered options, then "Tap your answer." The answer is never spoken.
  router.post('/quiz/question', async (req, res) => {
    const creature = quizCreature(req, res)
    if (!creature) return
    try {
      sendAudio(res, await service.quizQuestion(creature))
    } catch (err) {
      console.error('Quiz question failed:', err)
      res.status(502).json({ error: 'Voice is not available right now' })
    }
  })

  // POST /api/voice/quiz/reaction  body: { "creatureId": "...", "outcome": "correct" | "retry" | "ran-away" }
  // The game checks the answer and counts tries; this only speaks the reaction.
  router.post('/quiz/reaction', async (req, res) => {
    const { outcome } = req.body ?? {}
    if (!QUIZ_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: `outcome must be one of: ${QUIZ_OUTCOMES.join(', ')}` })
    }
    const creature = quizCreature(req, res)
    if (!creature) return
    try {
      sendAudio(res, await service.quizReaction(outcome, creature))
    } catch (err) {
      console.error('Quiz reaction failed:', err)
      res.status(502).json({ error: 'Voice is not available right now' })
    }
  })

  // GET /api/voice/guide/token -> { conversationToken } for @elevenlabs/client startSession
  router.get('/guide/token', async (req, res) => {
    if (!service.status().guide) {
      return res.status(503).json({ error: 'Voice guide is not set up yet' })
    }
    try {
      const conversationToken = await service.guideToken()
      res.set('Cache-Control', 'no-store').json({ conversationToken })
    } catch (err) {
      console.error('Guide token failed:', err)
      res.status(502).json({ error: 'Voice guide is not available right now' })
    }
  })

  return router
}
