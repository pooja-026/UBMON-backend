# campusDash backend

Express backend for [campusDash](https://github.com/sejal1012/campusDash): game data and an ElevenLabs voice layer.

## Setup

```bash
npm install
cp .env.example .env     # then fill in the values
npm run dev              # http://localhost:4000, restarts on file changes
npm test
```

## Voice setup (ElevenLabs)

1. In `.env`, set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.
2. Fill in `src/data/voice-content.json`: welcome note, arrival greetings, UB facts, jokes and the guide greeting. Entries starting with `TODO` are ignored.
3. Run `npm run agents:sync`. The first run creates two agents and prints their ids. Paste the ids into `.env`.
4. After editing facts, jokes, the guide greeting or stops, run `npm run agents:sync` again. Later runs update the agents in place. After editing the welcome note or arrival greetings, restart the server.

The two agents:

- **Narrator** (text only): writes the short lines spoken while walking. The backend turns them into MP3 with text-to-speech.
- **Guide** (voice): a two-way conversation the player starts from the frontend.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/stops`, `/api/stops/:id` | Stops |
| GET | `/api/creatures`, `/api/creatures/:id` | Creatures (correct answer hidden) |
| POST | `/api/creatures/:id/answer` | `{ "answerIndex": 0 }` → `{ "correct": true }` |
| GET | `/api/voice/status` | Which voice features are configured |
| POST | `/api/voice/narration` | `{ event, stopId }` → MP3 audio |
| POST | `/api/voice/place-info` | `{ text, stopId }` → spoken info about that place, from `src/data/place-info.json` |
| GET | `/api/voice/guide/token` | Short-lived token for the voice guide |

Frontend integration guide: [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md).

## Layout

```
src/
  app.js, server.js
  routes/      stops, creatures, voice
  voice/       config, ElevenLabs client, agent WebSocket, prompts, narration, service
  data/        stops.json, creatures.json (mock), voice-content.json, place-info.json
scripts/       sync-agents.js
test/
```
