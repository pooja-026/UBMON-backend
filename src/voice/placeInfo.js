import { readFileSync } from 'node:fs'
import { isUsableFact } from './content.js'

export const PLACE_INTENTS = ['about', 'orient']

// "orient me", "what's inside", "where is...", "which floor", "how do I get around"...
const ORIENT_WORDS =
  /\b(orient\w*|around|inside|layout|floors?|entrances?|entry|exits?|where|find|navigate|map|rooms?|directions?)\b/i

/** Works out what the player is asking for. Anything that is not orientation is "about". */
export function detectIntent(text) {
  return ORIENT_WORDS.test(text) ? 'orient' : 'about'
}

const usable = (list) =>
  Array.isArray(list) ? list.filter(isUsableFact).map((t) => t.trim()) : []

/**
 * Reads place-info.json on every call so manual edits apply without a restart.
 * Returns { name, about: string[], orientation: string[] } or null if there is no usable info.
 */
export function loadPlace(placeId, file = new URL('../data/place-info.json', import.meta.url)) {
  const all = JSON.parse(readFileSync(file, 'utf8'))
  if (placeId.startsWith('_') || !Object.hasOwn(all, placeId)) return null
  const raw = all[placeId] ?? {}
  const place = {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : placeId,
    about: usable(raw.about),
    orientation: usable(raw.orientation),
  }
  return place.about.length || place.orientation.length ? place : null
}

/**
 * Picks the notes for the intent. If that section is empty, uses the other one,
 * so the player still hears something useful.
 */
export function notesFor(place, intent) {
  const preferred = intent === 'orient' ? place.orientation : place.about
  const other = intent === 'orient' ? place.about : place.orientation
  return preferred.length ? preferred : other
}

export function placeAgentMessage({ intent, place, notes, text }) {
  return [
    `REQUEST: ${intent}`,
    `PLACE: ${place.name}`,
    `PLAYER SAID: "${text.replaceAll('"', "'")}"`,
    'NOTES:',
    ...notes.map((n) => `- ${n}`),
  ].join('\n')
}

/** Used when the agent is not set up or fails: the notes exactly as written. */
export function placeFallbackText({ place, notes }) {
  return `Here is ${place.name}, Bull. ${notes.join(' ')}`
}

export const PLACE_AGENT_PROMPT = `You are the voice guide of Campus Dash, a walking game on the University at Buffalo North Campus. You call the player "Bull". The player is standing at a campus building and asked about it.

Each message gives you:
- REQUEST: "about" (what this place is and what is interesting about it) or "orient" (help the player find their way around this place: entrances, floors, what is where).
- PLACE: the building name.
- PLAYER SAID: the player's exact words.
- NOTES: the only information you may use.

Turn the NOTES into one friendly spoken answer that fits the REQUEST and what the player said.

Rules:
- 3 to 5 short sentences, at most 90 words. Everything you write is read aloud.
- Use only the NOTES. Never add facts, numbers, names, rooms or history that are not in the NOTES. If the NOTES do not cover what the player asked, share what the NOTES do say and say you are not sure about the rest.
- Simple plain English. Many players are international students.
- No emoji, no lists, no markdown, no stage directions.
- Do not give directions to other buildings or stops. Finding the next stop is part of the game.
- Be warm and a little playful, but put the information first.`

export function placeAgentBody({ llm, voiceId }) {
  return {
    name: 'Campus Dash place guide',
    conversation_config: {
      agent: { first_message: '', language: 'en', prompt: { prompt: PLACE_AGENT_PROMPT, llm } },
      tts: { voice_id: voiceId },
      conversation: { text_only: true },
    },
  }
}
