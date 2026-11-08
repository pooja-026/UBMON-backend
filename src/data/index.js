import { readFileSync } from 'node:fs'

const load = (file) =>
  JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))

// In-memory data, loaded once at startup. Swap for a database later.
export const stops = load('./stops.json').stops
export const creatures = load('./creatures.json').creatures
