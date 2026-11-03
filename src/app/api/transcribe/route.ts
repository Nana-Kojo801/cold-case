// POST /api/transcribe: Muse Voice Transcribe turns the player's spoken question into text.
// The browser converts its recording to mono 16-bit PCM WAV at 16 kHz (the format the endpoint accepts).
// Audio is forwarded for transcription only and never stored.
import { META_BASE_URL, MODELS, apiKey, errorResponse } from "@/lib/server/meta";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 60;

const MAX_BYTES = 6 * 1024 * 1024; // ~3 minutes of 16 kHz mono PCM

export async function POST(req: Request) {
  const limited = rateLimit(req, "transcribe");
  if (limited) return limited;
  const key = apiKey();
  if (!key) {
    return Response.json({ error: "Voice input isn't available right now. Type your question instead.", code: "not_configured" }, { status: 503 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size < 100) return Response.json({ error: "No audio received" }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "That recording is too long. Keep questions short." }, { status: 413 });
  let keywords: string[] = [];
  try {
    keywords = JSON.parse(String(form.get("keywords") ?? "[]")).map(String).slice(0, 40);
  } catch {
    keywords = [];
  }

  const upstream = new FormData();
  upstream.append(
    "request",
    new Blob(
      [JSON.stringify({ model: MODELS.asr, audioEncoding: "WAV", mode: "PUSH_TO_TALK", languageBias: ["English"], ...(keywords.length ? { keywords } : {}) })],
      { type: "application/json" },
    ),
  );
  upstream.append("audio", audio, "question.wav");

  const call = async () => {
    const res = await fetch(`${META_BASE_URL}/asr/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      body: upstream,
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(45_000)]),
    });
    return res;
  };

  try {
    let res = await call();
    if (res.status === 429 || res.status >= 500) res = await call(); // retry once
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[cold-case] transcribe upstream", res.status, detail.slice(0, 200));
      const msg =
        res.status === 400
          ? "We couldn't read that audio. Try again, or type your question."
          : "Voice transcription is having trouble. Type your question, or retry.";
      return Response.json({ error: msg, code: `upstream_${res.status}`, retryable: res.status !== 400 }, { status: 502 });
    }
    const data = (await res.json()) as { transcript?: string };
    return Response.json({ text: (data.transcript ?? "").trim() });
  } catch (err) {
    return errorResponse(err);
  }
}
