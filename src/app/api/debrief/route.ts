// POST /api/debrief: Muse Wonder writes the coaching analysis from structured inputs
// (ledger excerpt, question tags, computed results), not from free chat.
import { DEBRIEF_INSTRUCTIONS, DEBRIEF_SCHEMA, ERROR_LABELS, type DebriefAI } from "@/lib/server/interrogation";
import { EFFORT, MODELS, errorResponse, jsonCall } from "@/lib/server/meta";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 120;

export async function POST(req: Request) {
  const limited = rateLimit(req, "debrief");
  if (limited) return limited;
  let body: Record<string, unknown> & { missedIds?: string[]; caughtIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const input = JSON.stringify(body).slice(0, 60_000);
  try {
    const r = await jsonCall<DebriefAI>({
      model: MODELS.wonder,
      instructions: DEBRIEF_INSTRUCTIONS,
      input,
      schemaName: "Debrief",
      schema: DEBRIEF_SCHEMA,
      effort: EFFORT.debrief,
      timeoutMs: 100_000,
      signal: req.signal,
    });
    const missedIds = new Set(body.missedIds ?? []);
    const caughtIds = new Set(body.caughtIds ?? []);
    return Response.json({
      summary: String(r.summary ?? "").slice(0, 800),
      tip: String(r.tip ?? "").slice(0, 400),
      missed: (r.missed ?? [])
        .filter((m) => missedIds.has(m.contradictionId) && ERROR_LABELS.includes(m.errorLabel))
        .map((m) => ({ ...m, errorExplanation: String(m.errorExplanation).slice(0, 300) })),
      caughtNotes: (r.caughtNotes ?? []).filter((c) => caughtIds.has(c.contradictionId)).map((c) => ({ ...c, how: String(c.how).slice(0, 300) })),
      model: MODELS.wonder,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
