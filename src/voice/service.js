import { askTextAgent } from './agentConversation.js'
import { loadVoiceContent } from './content.js'
import { createElevenLabsClient } from './elevenlabs.js'
import { arrivalText, fallbackText, narratorMessage } from './narration.js'
import { notesFor, placeAgentMessage, placeFallbackText } from './placeInfo.js'
import { quizQuestionText, quizReactionText } from './quiz.js'

export function createVoiceService({
  config,
  content = loadVoiceContent(),
  client = createElevenLabsClient({ apiKey: config.apiKey }),
  askAgent = askTextAgent,
  random = Math.random,
}) {
  const canSpeak = Boolean(config.apiKey && config.voiceId)

  /** Asks a text-only agent; on any failure logs and returns the fallback text. */
  async function askOrFallback(agentId, message, fallback, label) {
    if (!agentId) return fallback
    try {
      const signedUrl = await client.getSignedUrl(agentId)
      return await askAgent(signedUrl, message)
    } catch (err) {
      console.error(`${label} agent failed, using fallback text:`, err)
      return fallback
    }
  }

  async function lineFor(event, stop) {
    if (event === 'welcome') return content.welcome
    if (event === 'arrival') return arrivalText(stop, content.arrivalGreetings, random)
    return askOrFallback(
      config.narratorAgentId,
      narratorMessage(event, stop),
      fallbackText(event, stop),
      'Narrator',
    )
  }

  async function speak(text) {
    const audio = await client.textToSpeech({
      text,
      voiceId: config.voiceId,
      modelId: config.ttsModel,
    })
    return { text, audio }
  }

  return {
    status() {
      return {
        narration: canSpeak,
        narratorAgent: canSpeak && Boolean(config.narratorAgentId),
        placeAgent: canSpeak && Boolean(config.placeAgentId),
        guide: Boolean(config.apiKey && config.guideAgentId),
      }
    },

    async narrate(event, stop) {
      return speak(await lineFor(event, stop))
    },

    /** Speaks info about a place, rewritten by the place agent from the file notes. */
    async describePlace({ intent, place, text }) {
      const notes = notesFor(place, intent)
      const line = await askOrFallback(
        config.placeAgentId,
        placeAgentMessage({ intent, place, notes, text }),
        placeFallbackText({ place, notes }),
        'Place',
      )
      return speak(line)
    },

    /** Reads the creature's question and options. */
    quizQuestion(creature) {
      return speak(quizQuestionText(creature, content.quizIntros, random))
    },

    /** Reacts to an outcome decided by the game: correct, retry or ran-away. */
    quizReaction(outcome, creature) {
      return speak(quizReactionText(outcome, creature, content.quizReactions, random))
    },

    guideToken() {
      return client.getConversationToken(config.guideAgentId)
    },
  }
}
