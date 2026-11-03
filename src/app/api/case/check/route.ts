// POST /api/case/check: Muse Spark validates that a generated case is solvable (structured JSON verdict).
import { SOLVABILITY_INSTRUCTIONS, SOLVABILITY_SCHEMA, type RawCase, type SolvabilityResult } from "@/lib/server/case-prompts";
import { MODELS, errorResponse, jsonCall } from "@/lib/server/meta";
import { normalizeCase } from "@/lib/server/normalize";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 120;

export async function POST(req: Request) {
  const limited = rateLimit(req, "check");
  if (limited) return limited;
  let body: { raw?: RawCase };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.raw) return Response.json({ error: "Missing case" }, { status: 400 });
  const { problems } = normalizeCase(body.raw, "check");
  try {
    const verdict = await jsonCall<SolvabilityResult>({
      model: MODELS.spark,
      instructions: SOLVABILITY_INSTRUCTIONS,
      input: JSON.stringify(body.raw),
      schemaName: "SolvabilityVerdict",
      schema: SOLVABILITY_SCHEMA,
      effort: "medium",
      timeoutMs: 100_000,
      signal: req.signal,
    });
    const issues = [...problems, ...(verdict.issues ?? [])];
    const solvable = Boolean(verdict.solvable && verdict.culpritProvable) && problems.length === 0;
    return Response.json({ solvable, score: verdict.score, issues, model: MODELS.spark });
  } catch (err) {
    return errorResponse(err);
  }
}
