# Cold Case

**A cross-examination trainer disguised as a detective game.** Built during the Meta Global AI Developer Hackathon (indie track, solo; track: *Build for Your World*).

Every case is freshly generated and checked to be solvable. You search a generated crime scene, then question suspects **out loud**. Each suspect is an AI agent with its own secret, its own slice of the truth, a cover story, and a memory of everything it has told you. You win by catching contradictions and proving the culprit with evidence. Afterwards a debrief shows which contradictions you caught and which you missed, what kind of reasoning error each miss was, and how you questioned (open vs leading, follow-ups, compound questions, pacing). Progress is tracked across cases.

**Why:** debate and moot-court students practise cross-examination with a partner who plays a good, lying witness. Alone, that's hard. Cold Case is that partner, and it gives you a debrief afterwards.

**Why it's not a chatbot:** cases are generated as validated structured data; every answer goes into a **statement ledger** of atomic claims; a **contradiction engine** checks each new claim against earlier claims, other suspects' testimony and the evidence; and scoring is computed from the ledger, not from vibes.

## Which Meta model does what

All model calls run on the server (`src/app/api/*`), through the OpenAI SDK pointed at `https://api.meta.ai/v1`. The key never reaches the browser.

| Model | ID | Job in Cold Case | Where |
|---|---|---|---|
| **Muse Wonder** | `muse-wonder-1.0` | Writes the whole case file as strict JSON (structured output): setting, hidden truth and timeline, suspects with secrets and lies, evidence, key contradictions. Repairs a case that fails validation. **Plays each suspect** in character, holding its lie consistently and cracking under evidence. Writes the coaching debrief from structured inputs. | `api/case`, `api/suspect`, `api/debrief` |
| **Muse Spark** | `muse-spark-1.1` | Fast structured checks: **solvability validation** of every generated case; the **per-turn contradiction engine** (extracts atomic claims, finds conflicts with the ledger and evidence, tags the question as open / leading / follow-up / evidence / compound, sets a stress delta, flags which key contradictions the turn exposed). | `api/case/check`, `api/analyze` |
| **Muse Image** | `muse-image-1.0` | Crime-scene image, evidence close-ups and suspect portraits. Evidence photos use the **scene image as a reference image** so objects look the same across the case. | `api/image` |
| **SAM 3.1** | `sam-3.1` | Locates every scene clue from its noun phrase (concept prompts) once the scene exists; then **tap-to-examine** (point prompts) and **describe-to-find** (concept prompts). Masks are decoded with Meta's `@meta-sam/parser` and drawn as highlights; a match adds the clue to your evidence board. | `api/segment` |
| **Muse Voice Transcribe** | `muse-voice-transcribe-1.0` | Your spoken questions (and spoken accusation reasoning) to text, in push-to-talk mode, biased toward the case's names and evidence with `keywords`. The browser converts the recording to 16 kHz mono PCM WAV first. | `api/transcribe` |

Suspect voices use the browser's `speechSynthesis` with per-character pitch, rate and voice. They aren't a Meta feature.

## How a turn works

1. Hold the mic and speak (or type). The audio is converted to WAV in the browser and transcribed by Muse Voice Transcribe. You can edit the transcript before sending.
2. The suspect agent (Muse Wonder) gets **only its own record** (persona, what it truly knows, its secret, its cover story), its conversation so far, and the evidence you've shown it. The hidden truth and other suspects' secrets are never in its prompt (`src/lib/server/interrogation.ts`, whitelisted again in `api/suspect`).
3. The reply is spoken aloud and logged.
4. In the background, Muse Spark analyses the turn and updates the ledger and the suspect's stress meter. Presenting evidence the suspect `breaksOn`, or pushing stress past the threshold, makes them crack.
5. Contradictions are **never shown during play**. You have to notice them. The *Statements* tab lets you re-read everything that was said.
6. At accusation you pick the culprit, cite evidence and statements, and optionally argue it out loud. The score comes from the ledger: right culprit (40), required evidence cited (25), key contradictions actually surfaced during questioning (25), questioning quality (10).

## Run it

Requirements: Node 20.17+ (22 recommended).

```bash
npm install
cp .env.example .env.local      # then set MODEL_API_KEY=<your Meta Model API key>
npm run smoke                   # Milestone 0: one real call per Meta model
npm run dev                     # http://localhost:3000
```

Other scripts:

```bash
npm run gen:case -- --theme "a 1920s jazz club"   # generate + validate a case, print JSON
npm run demo:assets                               # pre-generate the demo case's images + SAM masks
npm run build && npm start
```

Microphone capture needs HTTPS (or `localhost`). On a phone, use the deployed Vercel URL.

### The bundled demo case

`public/demo-case/case.json` is a complete, hand-checked case (*The Saltmere Compass*) that ships with the app, so the demo never depends on a live generation. Run `npm run demo:assets` once with your key to generate its images with Muse Image and pre-compute its SAM 3.1 clue masks into `case.json`. Commit the results. After that:

- the demo case opens instantly and its scene taps work offline (the masks are stored);
- if the Meta API is unreachable, suspects fall back to offline replies built from their own records (marked "offline reply"), so the case stays playable end to end;
- without images, every picture falls back to a styled text card, and clues can be found with "Search by hand".

## Deploy (Vercel)

1. Import this public GitHub repo in Vercel.
2. Add the environment variable `MODEL_API_KEY` (and optional overrides from `.env.example`).
3. Deploy. Route handlers set `maxDuration` for long calls (case generation allows up to 300 s).

## Reliability, privacy, cost

- **Every external call can fail.** The SDK retries once on 429/5xx/timeouts, then the UI shows a friendly message with a Retry button. Specific fallbacks: typed input if voice fails; list search if SAM fails; text cards if an image fails; up to 2 automatic repairs if a case fails the solvability check, then an offer to play the demo case.
- **Rate limits** (`src/lib/server/ratelimit.ts`): per IP per minute, per IP per day for each costly route, and a global daily cap, with a friendly "come back later" message. They're in-memory per server instance (best effort on serverless) and configurable with env vars.
- **No accounts, no database.** Cases, sessions and images live in your browser's IndexedDB; progress and settings in localStorage. Audio is sent only to be transcribed and is never stored.

## Project map

```
src/app/                 screens: home, generating, board, interrogation, statements, accusation, debrief, progress
src/app/api/             server routes (all Meta calls)
src/lib/server/          Meta client, prompts + JSON schemas, case normalisation, SAM, images, rate limits
src/lib/client/          IndexedDB storage, recording + WAV conversion, TTS, SAM overlay, turn orchestration
src/lib/game.ts          scoring, question stats, heuristics, offline fallbacks (pure, shared)
src/lib/types.ts         CaseFile, Suspect, Evidence, LedgerEntry, Session, Debrief
scripts/                 smoke test, CLI case generator, demo asset generator
public/demo-case/        bundled demo case
```

## Model IDs

The IDs above were confirmed against Meta's model docs (dev.meta.ai/docs/models). Each one can be overridden with `MODEL_WONDER`, `MODEL_SPARK`, `MODEL_IMAGE`, `MODEL_SAM` or `MODEL_ASR`. If Wonder is too slow for live suspect replies, set `SUSPECT_MODEL=spark`; Wonder still writes cases and debriefs.
