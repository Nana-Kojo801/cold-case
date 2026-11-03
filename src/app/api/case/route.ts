// POST /api/case: Muse Wonder writes a case file as strict JSON ({mode:"generate"}),
// or repairs one that failed the solvability check ({mode:"repair", raw, issues}).
import { CASE_INSTRUCTIONS, CASE_SCHEMA, caseUserPrompt, repairUserPrompt, type RawCase } from "@/lib/server/case-prompts";
import { EFFORT, MODELS, errorResponse, jsonCall } from "@/lib/server/meta";
import { normalizeCase } from "@/lib/server/normalize";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 300;

export async function POST(req: Request) {
  const limited = rateLimit(req, "case");
  if (limited) return limited;
  let body: { mode?: "generate" | "repair"; theme?: string; raw?: RawCase; issues?: string[]; id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    const isRepair = body.mode === "repair" && body.raw;
    const raw = await jsonCall<RawCase>({
      model: MODELS.wonder,
      instructions: CASE_INSTRUCTIONS,
      input: isRepair ? repairUserPrompt(body.raw, (body.issues ?? []).slice(0, 20)) : caseUserPrompt(body.theme),
      schemaName: "CaseFile",
      schema: CASE_SCHEMA,
      effort: EFFORT.caseGen,
      timeoutMs: 270_000,
      signal: req.signal,
    });
    const { caseFile, problems } = normalizeCase(raw, isRepair && body.id ? body.id : undefined);
    return Response.json({ caseFile, raw, problems, model: MODELS.wonder });
  } catch (err) {
    return errorResponse(err);
  }
}
