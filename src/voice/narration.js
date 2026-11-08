import { isUsableFact } from './content.js'

export const NARRATION_EVENTS = ['welcome', 'leg-start', 'midpoint', 'arrival']

/** Events that need a stopId. */
export const STOP_EVENTS = ['leg-start', 'midpoint', 'arrival']

/** Arrival is a fixed template so the stop fact is read exactly as written. */
export function arrivalText(stop, greetings, random = Math.random) {
  const template = greetings[Math.floor(random() * greetings.length)]
  const greeting = template.replaceAll('{stop}', stop.name)
  return isUsableFact(stop.fact) ? `${greeting} ${stop.fact}` : greeting
}

/** Message sent to the narrator agent for leg events. */
export function narratorMessage(event, stop) {
  if (event === 'leg-start') {
    return `EVENT: leg-start. The player just set off toward ${stop.name} (id: ${stop.id}). Say one short send-off line.`
  }
  if (event === 'midpoint') {
    return `EVENT: midpoint. The player is about halfway to ${stop.name} (id: ${stop.id}). Say one short encouraging line.`
  }
  throw new Error(`No narrator message for event: ${event}`)
}

/** Used when the agent is not set up or unreachable, so the game still speaks. */
export function fallbackText(event, stop) {
  if (event === 'leg-start') return `Next stop: ${stop.name}. Good luck, Bull!`
  return `You are doing great, Bull. Keep going to ${stop.name}.`
}
