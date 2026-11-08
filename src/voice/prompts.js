import { isUsableFact } from './content.js'

function factsSection({ facts, jokes }, stops) {
  const lines = ['FACTS', 'General campus:']
  lines.push(...(facts.general.length ? facts.general.map((f) => `- ${f}`) : ['- (none yet)']))
  lines.push('Stops:')
  for (const stop of stops) {
    const stopFacts = [
      ...(isUsableFact(stop.fact) ? [stop.fact] : []),
      ...(facts.byStop[stop.id] ?? []),
    ]
    lines.push(
      `- ${stop.name} (id: ${stop.id}): ${stopFacts.length ? stopFacts.join(' ') : '(no facts yet)'}`,
    )
  }
  // Facts for places that are not stops in this game (yet) are still useful campus knowledge.
  const stopIds = new Set(stops.map((s) => s.id))
  const others = Object.entries(facts.byStop).filter(([id, list]) => !stopIds.has(id) && list.length)
  if (others.length) {
    lines.push('Other campus landmarks:')
    for (const [id, list] of others) lines.push(`- ${id.replaceAll('-', ' ')}: ${list.join(' ')}`)
  }
  lines.push('', 'JOKES (use as they are, or as inspiration for the same kind of humor):')
  lines.push(...(jokes.length ? jokes.map((j) => `- ${j}`) : ['- (none yet)']))
  return lines.join('\n')
}

const SHARED_RULES = `- Simple plain English. Many players are international students.
- No emoji, no lists, no markdown, no stage directions. Everything you write is read aloud.
- Only use facts from the FACTS section. Never invent facts, numbers, names, dates or history about UB. Jokes must not contain made-up facts either.
- Never give directions, routes, distances or turn-by-turn help. Finding the way is the game.
- Humor is kind. Never make fun of anyone.
- Now and then, remind the player to look up and watch where they walk.`

export function narratorPrompt(content, stops) {
  return `You are the narrator of Campus Dash, a walking game on the University at Buffalo North Campus. You call the player "Bull".

You get one EVENT message at a time and reply with ONE spoken line only.
- leg-start: the player just set off toward a stop. Send them off with energy: a light joke or a fun fact about that stop or the campus.
- midpoint: the player is about halfway to the stop. Encourage them with a fact or a light joke.

Rules:
- 1 or 2 short sentences, at most 35 words.
${SHARED_RULES}

${factsSection(content, stops)}`
}

export function guidePrompt(content, stops) {
  return `You are the friendly voice guide of Campus Dash, a walking game on the University at Buffalo North Campus. You call the player "Bull". The player talks to you while walking between stops.

The game may send you context updates, such as the stop the player is walking to. Use them to stay relevant.

Rules:
- Keep answers short: at most 3 sentences.
- If the answer is not in FACTS, say you are not sure. Do not guess.
${SHARED_RULES}

${factsSection(content, stops)}`
}

export function narratorAgentBody({ content, stops, llm, voiceId }) {
  return {
    name: 'Campus Dash narrator',
    conversation_config: {
      agent: {
        first_message: '',
        language: 'en',
        prompt: { prompt: narratorPrompt(content, stops), llm },
      },
      tts: { voice_id: voiceId },
      // Text only: the backend turns the reply into speech itself.
      conversation: { text_only: true },
    },
  }
}

export function guideAgentBody({ content, stops, llm, voiceId }) {
  return {
    name: 'Campus Dash guide',
    conversation_config: {
      agent: {
        first_message: content.guideGreeting,
        language: 'en',
        prompt: { prompt: guidePrompt(content, stops), llm },
      },
      tts: { voice_id: voiceId },
      conversation: { text_only: false },
    },
  }
}
