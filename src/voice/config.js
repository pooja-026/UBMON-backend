// All voice settings come from environment variables (see .env.example).
export function voiceConfig(env = process.env) {
  return {
    apiKey: env.ELEVENLABS_API_KEY || '',
    voiceId: env.ELEVENLABS_VOICE_ID || '',
    ttsModel: env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5',
    // LLM the ElevenLabs agents run on (hosted by ElevenLabs, no separate key needed).
    agentLlm: env.ELEVENLABS_AGENT_LLM || 'gemini-2.5-flash',
    narratorAgentId: env.ELEVENLABS_NARRATOR_AGENT_ID || '',
    guideAgentId: env.ELEVENLABS_GUIDE_AGENT_ID || '',
    placeAgentId: env.ELEVENLABS_PLACE_AGENT_ID || '',
  }
}
