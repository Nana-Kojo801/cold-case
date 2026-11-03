// POST /api/suspect: the suspect agent (Muse Wonder by default) answers one question in character.
// The prompt contains only this suspect's own record plus what the player said or showed.
import { buildSuspectPrompt, cleanReply, type CrackState, type SuspectTurnInput } from "@/lib/server/interrogation";
import { EFFORT, errorResponse, suspectModel, textCall } from "@/lib/server/meta";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 60;

const STATES: CrackState[] = ["calm", "nervous", "cracking"];

export async function POST(req: Request) {
  const limited = rateLimit(req, "suspect");
  if (limited) return limited;
  let body: SuspectTurnInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body?.suspect?.name || (!body.question?.trim() && !body.present)) {
    return Response.json({ error: "Missing question" }, { status: 400 });
  }
  // Whitelist the fields that may reach the prompt: nothing else from the client is used.
  const input: SuspectTurnInput = {
    incident: {
      title: String(body.incident?.title ?? ""),
      setting: String(body.incident?.setting ?? ""),
      victimOrIncident: String(body.incident?.victimOrIncident ?? ""),
    },
    suspect: {
      name: String(body.suspect.name),
      role: String(body.suspect.role ?? ""),
      personality: String(body.suspect.personality ?? ""),
      knows: Array.isArray(body.suspect.knows) ? body.suspect.knows.map(String) : [],
      secret: String(body.suspect.secret ?? ""),
      lie: String(body.suspect.lie ?? ""),
    },
    history: Array.isArray(body.history) ? body.history.map((h) => ({ q: String(h.q ?? ""), a: String(h.a ?? ""), shown: h.shown ? String(h.shown) : undefined })) : [],
    shownEvidence: Array.isArray(body.shownEvidence)
      ? body.shownEvidence.map((e) => ({ label: String(e.label ?? ""), description: String(e.description ?? "") }))
      : [],
    question: String(body.question ?? ""),
    present: body.present ? { label: String(body.present.label ?? ""), description: String(body.present.description ?? "") } : undefined,
    state: STATES.includes(body.state) ? body.state : "calm",
  };
  try {
    const { instructions, input: messages } = buildSuspectPrompt(input);
    const model = suspectModel();
    const text = await textCall({
      model,
      instructions,
      input: messages,
      effort: EFFORT.suspect,
      timeoutMs: 45_000,
      signal: req.signal,
    });
    if (!text) throw new Error("Empty reply from model");
    return Response.json({ answer: cleanReply(text), model });
  } catch (err) {
    return errorResponse(err);
  }
}
