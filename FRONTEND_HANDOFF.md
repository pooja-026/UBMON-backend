# Backend handoff for the frontend

The backend is an Express API that gives Campus Dash a voice through ElevenLabs. It can also serve the game data.

Everything here is optional for the game: if the backend is down, the game must still work, just silently.

You do **not** need any ElevenLabs keys. They live only in the backend `.env`.

## 1. Run it locally

```bash
cd backend
npm install
npm run dev          # http://localhost:4000
```

- **Backend `.env`:** ask Pooja for it. Keys are shared privately, never committed.
- **Frontend `.env`:** add `VITE_API_URL=http://localhost:4000`.
- **Quick check:** open http://localhost:4000/api/voice/status. All four values should be `true`.
- **Hear everything without writing code:** open http://localhost:4000/voice-test. It has the guide, the narrator lines, the creature quiz and place info.
- **Postman:** import `backend/postman/campusDash.postman_collection.json`. Every endpoint is ready to send.

## 2. Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/health` | `{ "status": "ok" }` |
| GET | `/api/voice` | List of voice endpoints |
| GET | `/api/voice/status` | `{ narration, narratorAgent, placeAgent, guide }` (booleans) |
| POST | `/api/voice/narration` | `{ event, stopId? }` → `audio/mpeg`, caption in the `X-Voice-Text` header |
| POST | `/api/voice/place-info` | `{ text, stopId }` → `audio/mpeg` about the place the player is at (see 3b) |
| POST | `/api/voice/quiz/question` | `{ creatureId }` → `audio/mpeg` reading the question and options (see 3c) |
| POST | `/api/voice/quiz/reaction` | `{ creatureId, outcome }` → `audio/mpeg` reaction (see 3c) |
| GET | `/api/voice/guide/token` | `{ conversationToken }` for the live voice guide |
| GET | `/api/stops`, `/api/stops/:id` | `Stop` objects (same shape as `src/types.ts`) |
| GET | `/api/creatures`, `/api/creatures/:id` | `Creature` objects **without** `question.answerIndex` |
| POST | `/api/creatures/:id/answer` | `{ answerIndex }` → `{ correct: boolean }` |

Errors are always JSON: `{ "error": "short message" }`.

- `400`: bad input.
- `404`: unknown id.
- `503`: voice not set up.
- `502`: ElevenLabs failed.

The stop and creature endpoints are there if the team wants to move data out of `src/data/*.mock.json`. Today the frontend reads its own JSON files, and that is fine. Pick one source as a team so content isn't kept in two places.

## 3. Voice: what plays when

The `stopId` values must match the backend's `stops.json`.

| Game moment (CLAUDE.md flow) | Call | The player hears |
| --- | --- | --- |
| Player taps **Start** (`startRun()`) | `welcome` (no `stopId`) | Welcome note |
| A target is shown: first stop, and after **Next stop** (`dismissStopCard()`) | `leg-start` + target `stopId` | Short AI-written joke or UB fact |
| Remaining distance first drops to half of the leg's starting distance (once per leg) | `midpoint` + target `stopId` | Short encouragement or fact |
| Stop collected, stop card opens (`stop-card` phase) | `arrival` + collected `stopId` | "Hey Bull, you reached Student Union! Congratulations." + the stop's fact |
| Creature tapped, catch screen opens (`openCatch(id)`, `catching` phase) | `quiz/question` + `creatureId` | "A wild X appeared!" + question + "Option one... two... three... Tap your answer." |
| Player taps an option (`answer(index)`) | `quiz/reaction` + outcome | "Nice catch!" / "Not quite, try again." / "Oh no, it ran away!" |

Timing:

- `welcome`, `arrival` and the quiz lines take about 0.3 to 0.8 s. They are fixed text, read exactly as written.
- `leg-start` and `midpoint` take about 2 to 3 s, because an AI (Gemini, through ElevenLabs) writes the line first.
- To hide the delay, fetch `leg-start` for the next stop while the stop card is open, and play it when **Next stop** is tapped.

## 3b. Place info: "tell about this hall", "orient me"

When the player asks about the place they are at, send what they said plus the current stop id:

```json
POST /api/voice/place-info
{ "text": "orient me about this", "stopId": "capen" }
```

- **What "this" means:** the `stopId` you send. Use the stop the player is at, usually the one just collected.
- **Which ids work:** the keys in the backend's `place-info.json`. These are the same as the game's stop ids: `lockwood`, `cfa`, `davis`, `alumni-arena`, `capen`, `student-union`, `nsc` and `clemens`.
- **How the intent is chosen:** the backend reads `text`.
  - Orientation words ("orient", "inside", "where", "floor", "entrance", ...) give a walk-through of the building.
  - Anything else gives "about" info.
  - The chosen intent comes back in the `X-Place-Intent` header.
- **Where the content comes from:** the backend's `place-info.json`. Gemini rewrites it as a friendly spoken answer, which takes about 2 to 3 s.
- **Errors:** `404` means there is no info for that place yet. Hide the option or skip silently.
- **Text input:** `text` can come from a button ("Tell me about this hall" / "Orient me") or from your own speech-to-text. It must be 1 to 300 characters.

Response format is the same as narration: an `audio/mpeg` body with the caption in `X-Voice-Text`. With the client below: `speak('place-info', { text, stopId })`.

## 3c. Creature quiz voice

The game stays in charge. It checks the answer and counts tries (`quizTries` in `config.ts`), exactly as in CLAUDE.md. The voice only reads the question and reacts.

1. **Catch screen opens:** call `quiz/question` with `{ creatureId }`.
   - The voice reads the question and the numbered options, then says "Tap your answer".
   - It never says which option is correct.
   - There is no timer. The stopwatch is already paused during the quiz.
2. **Player taps an option:** your store checks it (locally, or with `POST /api/creatures/:id/answer`) and picks the outcome:
   - `correct`: caught.
   - `retry`: wrong, but tries are left.
   - `ran-away`: wrong on the last try.
3. **Then:** call `quiz/reaction` with `{ creatureId, outcome }` and play it.

```ts
// openCatch(creatureId)
speak('quiz/question', { creatureId })

// answer(index): after the store has decided the outcome
speak('quiz/reaction', { creatureId, outcome }) // 'correct' | 'retry' | 'ran-away'
```

Tips:

- If the player taps while the question is still being read, stop it (`playClip` already does) and play the reaction.
- The `creatureId` must exist in the backend's `creatures.json`.
- The wording of intros and reactions lives in the backend's `voice-content.json` (`quizIntros`, `quizReactions`).

## 4. Drop-in voice client

This is a suggested new file, `src/voice/voiceClient.ts`. Agree with the team on where it lives.

```ts
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export type NarrationEvent = 'welcome' | 'leg-start' | 'midpoint' | 'arrival'
export interface Clip { url: string; caption: string }

// One shared <audio> element. Mobile browsers only allow audio that was "unlocked"
// by a user tap, so call unlockAudio() inside the Start button's click handler.
const player = new Audio()
let muted = false

export function setVoiceMuted(value: boolean) {
  muted = value
  if (muted) player.pause()
}

export function unlockAudio() {
  player.src = silentWavUrl()
  player.play().catch(() => {}) // a failure here only means no voice later
}

export type VoicePath = 'narration' | 'place-info' | 'quiz/question' | 'quiz/reaction'

/** Fetches a clip from any voice endpoint without playing it. Returns null on any failure. */
export async function fetchVoice(path: VoicePath, body: object): Promise<Clip | null> {
  try {
    const res = await fetch(`${API}/api/voice/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const caption = decodeURIComponent(res.headers.get('X-Voice-Text') ?? '')
    return { url: URL.createObjectURL(await res.blob()), caption }
  } catch (err) {
    console.error(`Voice request failed: ${path}`, err)
    return null
  }
}

/** Narration shortcut (use it to prefetch). */
export function fetchNarration(event: NarrationEvent, stopId?: string) {
  return fetchVoice('narration', { event, stopId })
}

/** Plays a clip, stopping any clip already playing. Resolves when it ends. */
export function playClip(clip: Clip | null): Promise<void> {
  if (!clip || muted) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      URL.revokeObjectURL(clip.url)
      resolve()
    }
    player.onended = done
    player.onerror = done
    player.src = clip.url
    player.play().catch((err) => {
      console.error('Audio play blocked', err)
      done()
    })
  })
}

/** Fetch and play in one go, e.g. speak('quiz/question', { creatureId }). */
export async function speak(path: VoicePath, body: object) {
  await playClip(await fetchVoice(path, body))
}

/** Narration shortcut, e.g. say('welcome') or say('arrival', stop.id). */
export async function say(event: NarrationEvent, stopId?: string) {
  await playClip(await fetchNarration(event, stopId))
}

function silentWavUrl(): string {
  const samples = 800
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true)
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples * 2, true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}
```

Usage sketch:

```ts
// Start button handler
unlockAudio()
const firstLeg = fetchNarration('leg-start', firstStopId) // prefetch while welcome plays
await say('welcome')
await playClip(await firstLeg)

// On arrival (stop card opens)
say('arrival', stop.id)
const nextLeg = fetchNarration('leg-start', nextStopId) // prefetch

// On "Next stop"
playClip(await nextLeg)

// Each GPS fix while playing
if (!midpointSaid && distanceToTarget <= legStartDistance / 2) {
  midpointSaid = true
  say('midpoint', target.id)
}
```

The midpoint check needs `legStartDistance` (the distance to the target when the leg began) and a `midpointSaid` flag. Both are reset at each new leg. These fit naturally in the game store.

## 5. Two-way voice guide (optional feature)

This adds a new dependency: `npm install @elevenlabs/client` (or `@elevenlabs/react`). Tell the team first, as CLAUDE.md asks. The backend test page uses `@elevenlabs/client@1.30.0`.

```ts
import { Conversation } from '@elevenlabs/client'

export async function startGuide(targetName: string) {
  await navigator.mediaDevices.getUserMedia({ audio: true }) // mic permission first
  const res = await fetch(`${API}/api/voice/guide/token`)
  if (!res.ok) throw new Error('Guide not available')
  const { conversationToken } = await res.json()
  setVoiceMuted(true) // keep the narrator quiet while talking
  const conversation = await Conversation.startSession({
    conversationToken,
    connectionType: 'webrtc',
    onMessage: ({ message, role }) => console.log(role, message), // optional: show a transcript
  })
  conversation.sendContextualUpdate(`The player is walking to ${targetName}.`)
  return conversation
}
// When the target changes: conversation.sendContextualUpdate(`The player is walking to ${name}.`)
// To stop:                  await conversation.endSession(); setVoiceMuted(false)
```

- Start it only from a "Talk to guide" button.
- Fetch a new token for each session. Tokens are short-lived.
- The token works live. The full mic conversation can be tried on http://localhost:4000/voice-test (**Start talking**). Please test it on a phone early.

## 6. Rules

- **Never block the game on voice.** On any error, carry on silently. All helpers above already return `null` or resolve.
- **Respect the sound setting.** When sound is off in Settings, call `setVoiceMuted(true)`.
- **Use `GET /api/voice/status` on load.** Hide the "Talk to guide" button if `guide` is `false`.
- **Only send what each endpoint asks for:** event names, stop ids, creature ids, quiz outcomes, and the player's words for place info. Never GPS positions.
- **Update the privacy note.** The intro says "Nothing is sent anywhere". It should now say that location stays on the phone, and that voice lines are generated by ElevenLabs.

## 7. Deploying

- The deployed frontend is HTTPS, so the backend must be hosted on HTTPS too, for example Render or Railway. A phone cannot reach `localhost`. Hosting is not set up yet.
- Frontend env on Vercel: `VITE_API_URL=https://<backend-host>`.
- Backend env: `CORS_ORIGIN=http://localhost:5173,https://<frontend>.vercel.app`. This is a comma-separated list of allowed sites.

## 8. Open decisions for the team

1. CLAUDE.md says "no backend in the MVP". The voice layer needs one. Agree this is in scope.
2. Where does content live: frontend JSON or backend API? The stop ids must match either way.
3. Who adds `voiceClient.ts` and the store hooks (Person 2 or Person 3)?
4. Is the two-way guide in the demo, or only the narrator?
5. Where the backend is hosted.
