# Campus Dash API reference

Quick reference for every endpoint. For when to call each one during a run, and for the drop-in voice client code, see [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md).

## Base URLs

| Environment | Base URL |
| --- | --- |
| Production (Railway) | `https://ubmon-backend-production.up.railway.app` |
| Local | `http://localhost:4000` |

Set it in the frontend `.env` as `VITE_API_URL`.

## General rules

- **Requests:** bodies are JSON. Send `Content-Type: application/json`.
- **Errors:** always JSON, `{ "error": "short message" }`. Show players a friendly message, never this text.
- **Audio responses:**
  - Every voice endpoint except `/status`, `/guide/token` and `GET /api/voice` returns `audio/mpeg` (an MP3).
  - The spoken text is in the `X-Voice-Text` response header, URI-encoded. Read it with `decodeURIComponent(res.headers.get('X-Voice-Text'))`.
- **CORS:** the backend only accepts allowed frontend origins (`localhost:5173` and the deployed site). The `X-Voice-Text` and `X-Place-Intent` headers are readable from the browser.
- **No auth:** you never need API keys. ElevenLabs keys stay on the backend.
- **Privacy:** never send GPS positions. Send only the fields listed below.

### Status codes

| Code | Meaning | What the frontend should do |
| --- | --- | --- |
| `200` | OK | Use the response |
| `400` | Bad input (missing or invalid field) | A bug in the request: fix it |
| `404` | Unknown id, or no content for it yet | Skip silently, or hide the feature |
| `500` | Server could not read its data | Skip silently |
| `502` | ElevenLabs failed | Skip the audio and carry on |
| `503` | Voice not set up on the server | Skip the audio; hide voice features |

The game must never wait on or break because of voice.

## IDs

| Kind | Current ids |
| --- | --- |
| Stop ids (`stops.json`) | `mock-a`, `mock-b`, `mock-c`, `mock-d` (mock data until the real stops land) |
| Creature ids (`creatures.json`) | `mock-creature-a`, `mock-creature-b`, `mock-creature-c`, `mock-creature-d` |
| Place ids (`place-info.json`) | `lockwood-library`, `natural-sciences-complex`, `capen-hall`, `broadview-arena`, `davis-hall`, `student-union`, `center-for-the-arts`, `clemens-hall` |

When the real stops are added, stop ids and place ids should be the same names, for example `capen-hall`.

---

## Health

### `GET /api/health`

Checks that the server is up.

```json
200  { "status": "ok" }
```

---

## Game data

### `GET /api/stops`

All stops. The shape matches `Stop` in the frontend's `src/types.ts`.

```json
200  [
  {
    "id": "mock-a",
    "name": "Mock stop A (fake)",
    "address": "MOCK",
    "coords": [-78.787, 43.001],
    "photo": "",
    "fact": "MOCK fact.",
    "creatureId": "mock-creature-a"
  }
]
```

### `GET /api/stops/:id`

One stop. Returns `404 { "error": "Stop not found" }` for an unknown id.

### `GET /api/creatures`

All creatures. The correct answer (`question.answerIndex`) is removed.

```json
200  [
  {
    "id": "mock-creature-a",
    "name": "Mock creature A",
    "stopId": "mock-a",
    "coords": [-78.7873, 43.0013],
    "art": "",
    "question": { "text": "MOCK question?", "options": ["One", "Two", "Three"] }
  }
]
```

### `GET /api/creatures/:id`

One creature, without the answer. Returns `404 { "error": "Creature not found" }` for an unknown id.

### `POST /api/creatures/:id/answer`

Checks a quiz answer on the server.

```json
Request   { "answerIndex": 0 }
200       { "correct": true }
400       { "error": "answerIndex must be an integer from 0 to 2" }
404       { "error": "Creature not found" }
```

---

## Voice

### `GET /api/voice`

Lists the voice endpoints. Handy in a browser.

### `GET /api/voice/status`

Which voice features are working. Call it once when the app loads.

```json
200  { "narration": true, "narratorAgent": true, "placeAgent": true, "guide": true }
```

| Field | If `false` |
| --- | --- |
| `narration` | No voice at all. Skip every voice call. |
| `narratorAgent` | Walking lines still play, but as simple stock lines instead of AI-written ones. |
| `placeAgent` | Place info still plays, but reads the notes as written instead of a rewritten answer. |
| `guide` | Hide the "Talk to guide" button. |

### `POST /api/voice/narration`

The narrator line for a game moment. Returns `audio/mpeg`.

```json
Request   { "event": "arrival", "stopId": "mock-a" }
```

| `event` | `stopId` | When | Typical time |
| --- | --- | --- | --- |
| `welcome` | not needed | Player taps Start | ~0.5 s |
| `leg-start` | target stop | A new target is shown | 2–3 s (AI-written) |
| `midpoint` | target stop | Halfway to the target, once per leg | 2–3 s (AI-written) |
| `arrival` | collected stop | Stop card opens | ~0.5 s |

| Response | Body |
| --- | --- |
| `200` | MP3. Header `X-Voice-Text` |
| `400` | `{ "error": "event must be one of: welcome, leg-start, midpoint, arrival" }` |
| `404` | `{ "error": "Stop not found" }` (unknown or missing `stopId` for a non-welcome event) |
| `502` / `503` | Voice failed / not set up |

### `POST /api/voice/place-info`

Spoken info about the place the player is at ("tell about this hall", "orient me"). Returns `audio/mpeg`.

```json
Request   { "text": "orient me about this", "stopId": "capen-hall" }
```

- **`text`:** what the player said or tapped, 1 to 300 characters.
- **`stopId`:** the place id (see IDs above).
- **Intent:** chosen from `text`. Words like orient, inside, where, floor or entrance pick `orient`. Anything else is `about`.

| Response | Body |
| --- | --- |
| `200` | MP3. Headers `X-Voice-Text`, `X-Place-Intent` (`about` or `orient`) |
| `400` | `{ "error": "text must be 1 to 300 characters" }` or `{ "error": "stopId is required" }` |
| `404` | `{ "error": "No info for this place yet" }` |
| `500` | `{ "error": "Place info is not available right now" }` |
| `502` / `503` | Voice failed / not set up |

Takes about 2–3 s (AI-written).

### `POST /api/voice/quiz/question`

Reads the creature's question and numbered options, then "Tap your answer." The correct answer is never spoken. Returns `audio/mpeg`.

```json
Request   { "creatureId": "mock-creature-a" }
```

| Response | Body |
| --- | --- |
| `200` | MP3. Header `X-Voice-Text`, e.g. "A wild Sparky appeared! … Option one: … Tap your answer." |
| `404` | `{ "error": "Creature not found" }` or `{ "error": "This creature has no question yet" }` |
| `502` / `503` | Voice failed / not set up |

Takes about 0.8 s.

### `POST /api/voice/quiz/reaction`

The voice reaction after the game has checked an answer. The game decides the outcome; the backend only speaks it. Returns `audio/mpeg`.

```json
Request   { "creatureId": "mock-creature-a", "outcome": "retry" }
```

| `outcome` | Send it when |
| --- | --- |
| `correct` | The answer is right: caught |
| `retry` | Wrong, but tries are left |
| `ran-away` | Wrong on the last try |

| Response | Body |
| --- | --- |
| `200` | MP3. Header `X-Voice-Text` |
| `400` | `{ "error": "outcome must be one of: correct, retry, ran-away" }` |
| `404` | `{ "error": "Creature not found" }` |
| `502` / `503` | Voice failed / not set up |

Takes about 0.3 s.

### `GET /api/voice/guide/token`

A short-lived token to start a live two-way voice conversation with the guide, using `@elevenlabs/client`. Fetch a new token for each session.

```json
200  { "conversationToken": "eyJ..." }
503  { "error": "Voice guide is not set up yet" }
502  { "error": "Voice guide is not available right now" }
```

```ts
const conversation = await Conversation.startSession({ conversationToken, connectionType: 'webrtc' })
```

---

## Example: play any voice endpoint

```ts
async function playVoice(path: string, body: object) {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/voice/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null // skip silently
    const caption = decodeURIComponent(res.headers.get('X-Voice-Text') ?? '')
    const audio = new Audio(URL.createObjectURL(await res.blob()))
    await audio.play()
    return caption
  } catch {
    return null
  }
}

playVoice('narration', { event: 'arrival', stopId: 'capen-hall' })
playVoice('quiz/question', { creatureId: 'mock-creature-a' })
```

On phones, audio must first be unlocked by a tap. Use the full client in [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md#4-drop-in-voice-client), which handles this.

## Try it

- **Postman:** import `postman/campusDash.postman_collection.json`. Set `baseUrl` to the production or local URL.
- **Browser test page (local only):** http://localhost:4000/voice-test
