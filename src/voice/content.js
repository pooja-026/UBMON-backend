import { readFileSync } from 'node:fs'

/** Placeholder entries (TODO / MOCK) are never given to the agents or read aloud. */
export const isUsableFact = (text) =>
  typeof text === 'string' && text.trim() !== '' && !/^(TODO|MOCK)\b/i.test(text.trim())

// A fact can be a plain string or { "text": "...", "source": "https://..." }.
// Sources are for the team to verify facts; only the text is given to the agents.
const textOf = (entry) => (typeof entry === 'string' ? entry : entry?.text)

const usable = (list) =>
  Array.isArray(list) ? list.map(textOf).filter(isUsableFact).map((t) => t.trim()) : []

export const DEFAULT_CONTENT = {
  welcome: 'Welcome to Campus Dash, Bull! Let us go!',
  guideGreeting: 'Hey Bull! I am your campus guide. Ask me anything about UB while you walk.',
  arrivalGreetings: ['Hey Bull, you reached {stop}! Congratulations.'],
  quizIntros: ['{creature} appeared! Answer right to catch it.'],
  quizReactions: {
    correct: ['Nice catch, Bull! {creature} is in your Dex.'],
    retry: ['Not quite, Bull. Try again.'],
    ranAway: ['Oh no, {creature} ran away! You can catch it on another run.'],
  },
}

const listOr = (list, fallback) => {
  const clean = usable(list)
  return clean.length ? clean : fallback
}

/** Cleans raw content: drops placeholders and fills in defaults. */
export function normalizeContent(raw = {}) {
  const byStop = {}
  for (const [stopId, facts] of Object.entries(raw.facts?.byStop ?? {})) {
    byStop[stopId] = usable(facts)
  }
  const reactions = raw.quizReactions ?? {}
  const defaults = DEFAULT_CONTENT.quizReactions
  return {
    welcome: isUsableFact(raw.welcome) ? raw.welcome.trim() : DEFAULT_CONTENT.welcome,
    guideGreeting: isUsableFact(raw.guideGreeting)
      ? raw.guideGreeting.trim()
      : DEFAULT_CONTENT.guideGreeting,
    arrivalGreetings: listOr(raw.arrivalGreetings, DEFAULT_CONTENT.arrivalGreetings),
    quizIntros: listOr(raw.quizIntros, DEFAULT_CONTENT.quizIntros),
    quizReactions: {
      correct: listOr(reactions.correct, defaults.correct),
      retry: listOr(reactions.retry, defaults.retry),
      ranAway: listOr(reactions.ranAway, defaults.ranAway),
    },
    facts: { general: usable(raw.facts?.general), byStop },
    jokes: usable(raw.jokes),
  }
}

export function loadVoiceContent() {
  const raw = JSON.parse(
    readFileSync(new URL('../data/voice-content.json', import.meta.url), 'utf8'),
  )
  return normalizeContent(raw)
}
