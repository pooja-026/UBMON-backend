import { Router } from 'express'
import { stops } from '../data/index.js'

const router = Router()

// GET /api/stops
router.get('/', (req, res) => {
  res.json(stops)
})

// GET /api/stops/:id
router.get('/:id', (req, res) => {
  const stop = stops.find((s) => s.id === req.params.id)
  if (!stop) return res.status(404).json({ error: 'Stop not found' })
  res.json(stop)
})

export default router
