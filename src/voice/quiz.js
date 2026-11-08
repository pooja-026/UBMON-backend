// Spoken lines for the creature quiz. These are fixed templates (no AI) so the
// question and options are read exactly as written. The game itself decides
// whether an answer is right and counts tries; the voice only reacts.

export const QUIZ_OUTCOMES = ['correct', 'retry', 'ran-away']

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six']

const pick = (list, random) => list[Math.floor(random() * list.length)]
const fill = (template, creature) => template.replaceAll('{creature}', creature.name)
const trimEnd = (text) => text.trim().replace(/[.?!:;,]+$/, '')

/** Intro + question + numbered options + prompt to tap. Never includes the answer. */
export function quizQuestionText(creature, intros, random = Math.random) {
  const { text, options } = creature.question
  const optionLines = options.map(
    (option, i) => `Option ${NUMBER_WORDS[i] ?? i + 1}: ${trimEnd(option)}.`,
  )
  return [fill(pick(intros, random), creature), text.trim(), ...optionLines, 'Tap your answer.'].join(' ')
}

/** Reaction after the game has checked the answer. */
export function quizReactionText(outcome, creature, reactions, random = Math.random) {
  const key = outcome === 'ran-away' ? 'ranAway' : outcome
  return fill(pick(reactions[key], random), creature)
}

/** A creature can be quizzed if it has a question with at least two options. */
export function hasQuiz(creature) {
  const q = creature?.question
  return Boolean(
    q && typeof q.text === 'string' && q.text.trim() && Array.isArray(q.options) && q.options.length >= 2,
  )
}
