// Creates or updates the two ElevenLabs agents from src/data/voice-content.json and stops.json.
// Usage: npm run agents:sync
import { stops } from '../src/data/index.js'
import { voiceConfig } from '../src/voice/config.js'
import { loadVoiceContent } from '../src/voice/content.js'
import { createElevenLabsClient } from '../src/voice/elevenlabs.js'
import { placeAgentBody } from '../src/voice/placeInfo.js'
import { guideAgentBody, narratorAgentBody } from '../src/voice/prompts.js'

const config = voiceConfig()
const missing = ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'].filter((name) => !process.env[name])
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`)
  process.exit(1)
}

const client = createElevenLabsClient({ apiKey: config.apiKey })
const input = { content: loadVoiceContent(), stops, llm: config.agentLlm, voiceId: config.voiceId }

const agents = [
  {
    label: 'Narrator',
    envName: 'ELEVENLABS_NARRATOR_AGENT_ID',
    id: config.narratorAgentId,
    body: narratorAgentBody(input),
  },
  {
    label: 'Guide',
    envName: 'ELEVENLABS_GUIDE_AGENT_ID',
    id: config.guideAgentId,
    body: guideAgentBody(input),
  },
  {
    label: 'Place',
    envName: 'ELEVENLABS_PLACE_AGENT_ID',
    id: config.placeAgentId,
    body: placeAgentBody(input),
  },
]

const HINTS = {
  voice_not_found:
    'ELEVENLABS_VOICE_ID is not in your account. Add the voice to "My Voices" in ElevenLabs, then copy its ID.',
  missing_permissions:
    'Your API key is missing a permission. Edit the key in ElevenLabs > Developers > API Keys.',
  invalid_api_key: 'ELEVENLABS_API_KEY is wrong. Copy it again from ElevenLabs > Developers > API Keys.',
}

for (const agent of agents) {
  try {
    if (agent.id) {
      await client.updateAgent(agent.id, agent.body)
      console.log(`${agent.label} agent updated (${agent.id})`)
    } else {
      const id = await client.createAgent(agent.body)
      console.log(`${agent.label} agent created. Add this line to .env:\n  ${agent.envName}=${id}`)
    }
  } catch (err) {
    const code = Object.keys(HINTS).find((key) => err.message.includes(key))
    console.error(`\n${agent.label} agent: ${code ? HINTS[code] : 'request failed.'}`)
    console.error(`Details: ${err.message}`)
    process.exitCode = 1
    break
  }
}
