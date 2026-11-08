import { Router } from 'express'
import { creatures } from '../data/index.js'

const router = Router()

// Never send the correct answer to the client.
const toPublic = ({ question: { answerIndex, ...question }, ...rest }) => ({
  ...rest,
  question,
})

const findCreature = (id) => creatures.find((c) => c.id === id)

// GET /api/creatures
router.get('/', (req, res) => {
  res.json(creatures.map(toPublic))
})

// GET /api/creatures/:id
router.get('/:id', (req, res) => {
  const creature = findCreature(req.params.id)
  if (!creature) return res.status(404).json({ error: 'Creature not found' })
  res.json(toPublic(creature))
})

// POST /api/creatures/:id/answer   body: { "answerIndex": 0 }
router.post('/:id/answer', (req, res) => {
  const creature = findCreature(req.params.id)
  if (!creature) return res.status(404).json({ error: 'Creature not found' })

  const { answerIndex } = req.body ?? {}
  const optionCount = creature.question.options.length
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= optionCount) {
    return res
      .status(400)
      .json({ error: `answerIndex must be an integer from 0 to ${optionCount - 1}` })
  }

  res.json({ correct: answerIndex === creature.question.answerIndex })
})

export default router
