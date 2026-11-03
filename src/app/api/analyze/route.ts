// POST /api/analyze: Muse Spark extracts claims from the suspect's answer, checks them against the
// ledger and the evidence, tags the player's question, and returns a stress delta (structured JSON).
import { ANALYSIS_INSTRUCTIONS, ANALYSIS_SCHEMA, type AnalysisResult } from "@/lib/server/interrogation";
import { EFFORT, MODELS, errorResponse, jsonCall } from "@/lib/server/meta";
import { rateLimit } from "@/lib/server/ratelimit";
import { QUESTION_TAGS } from "@/lib/types";

export const maxDuration = 60;

type Body = {
  suspect: { id: string; name: string };
  question: string;
  presentedEvidence?: { id: string; label: string; description: string };
  answer: string;
  previous?: { q: string; a: string };
  priorClaims: { ref: string; suspectName: string; claim: string }[];
  evidence: { id: string; label: string; description: string }[];
  keyContradictions: { id: string; suspectId?: string; between: [string, string]; explanation: string; evidenceIds?: string[] }[];
  stress: number;
};

export async function POST(req: Request) {
  const limited = rateLimit(req, "analyze");
  if (limited) return limited;
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body?.suspect?.id || !body.answer) return Response.json({ error: "Missing turn" }, { status: 400 });

  const priorClaims = (body.priorClaims ?? []).slice(-120);
  const evidence = (body.evidence ?? []).slice(0, 12);
  const kcs = (body.keyContradictions ?? []).slice(0, 8);
  const payload = {
    suspect: body.suspect,
    currentStress: body.stress,
    previousExchangeWithThisSuspect: body.previous ?? null,
    detectiveQuestion: String(body.question ?? "").slice(0, 800),
    evidencePresentedThisTurn: body.presentedEvidence ?? null,
    suspectAnswer: String(body.answer).slice(0, 1200),
    priorClaims,
    evidenceFacts: evidence.map((e) => ({ ref: `evidence:${e.id}`, label: e.label, fact: e.description })),
    keyContradictions: kcs.map((c) => ({ id: c.id, suspectId: c.suspectId, falseStatement: c.between[0], conflictsWith: c.between[1], explanation: c.explanation, exposingEvidence: c.evidenceIds })),
  };

  try {
    const r = await jsonCall<AnalysisResult>({
      model: MODELS.spark,
      instructions: ANALYSIS_INSTRUCTIONS,
      input: JSON.stringify(payload),
      schemaName: "TurnAnalysis",
      schema: ANALYSIS_SCHEMA,
      effort: EFFORT.analysis,
      timeoutMs: 45_000,
      signal: req.signal,
    });
    const validRefs = new Set([...priorClaims.map((c) => c.ref), ...evidence.map((e) => `evidence:${e.id}`)]);
    const kcIds = new Set(kcs.map((c) => c.id));
    const result: AnalysisResult = {
      claims: (r.claims ?? []).map(String).slice(0, 8),
      contradictsWith: (r.contradictsWith ?? []).filter((x) => validRefs.has(x)),
      stressDelta: Math.max(-10, Math.min(30, Math.round(Number(r.stressDelta) || 0))),
      questionTags: (r.questionTags ?? []).filter((t) => QUESTION_TAGS.includes(t)),
      surfacedContradictionIds: (r.surfacedContradictionIds ?? []).filter((x) => kcIds.has(x)),
    };
    return Response.json({ ...result, model: MODELS.spark });
  } catch (err) {
    return errorResponse(err);
  }
}
