import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import stopsRouter from './routes/stops.js'
import creaturesRouter from './routes/creatures.js'
import { createVoiceRouter } from './routes/voice.js'
import { voiceConfig } from './voice/config.js'
import { createVoiceService } from './voice/service.js'

export function createApp({
  voiceService = createVoiceService({ config: voiceConfig() }),
  loadPlace,
} = {}) {
  const app = express()

  // CORS_ORIGIN can be a comma-separated list, e.g. local dev + deployed frontend.
  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  app.use(
    cors({
      origin: allowedOrigins,
      exposedHeaders: ['X-Voice-Text', 'X-Place-Intent'],
    }),
  )
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/stops', stopsRouter)
  app.use('/api/creatures', creaturesRouter)
  app.use('/api/voice', createVoiceRouter({ service: voiceService, ...(loadPlace && { loadPlace }) }))

  // Developer page for talking to the guide and playing narrator lines. Not served in production.
  if (process.env.NODE_ENV !== 'production') {
    app.get('/voice-test', (req, res) => {
      res.sendFile(fileURLToPath(new URL('../public/voice-test.html', import.meta.url)))
    })
  }

  // Unknown routes
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Errors (including malformed JSON bodies)
  app.use((err, req, res, next) => {
    const status = err.status ?? 500
    if (status >= 500) console.error(err)
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message })
  })

  return app
}
