// Prompts and schemas for the interrogation loop and the debrief.
import { QUESTION_TAGS, type QuestionTag, type ReasoningErrorLabel } from "@/lib/types";

export type CrackState = "calm" | "nervous" | "cracking";

export type SuspectRecord = {
  name: string;
  role: string;
  personality: string;
  knows: string[];
  secret: string;
  lie: string;
};

export type SuspectTurnInput = {
  incident: { title: string; setting: string; victimOrIncident: string };
  suspect: SuspectRecord;
  history: { q: string; a: string; shown?: string }[];
  shownEvidence: { label: string; description: string }[];
  question: string;
  present?: { label: string; description: string };
  state: CrackState;
};

const cap = (s: unknown, n: number) => String(s ?? "").slice(0, n);

/**
 * Build the suspect agent's prompt. It only ever contains this suspect's own record plus what the player
 * has said or shown. The hidden truth and other suspects' secrets are never passed in.
 */
export function buildSuspectPrompt(t: SuspectTurnInput) {
  const s = t.suspect;
  const stateText: Record<CrackState, string> = {
    calm: "You are composed. Stick to your cover story whenever it applies.",
    nervous:
      "You are getting rattled. Your answers get shorter and more defensive, and you may let a small true detail slip, but you still hold to your cover story.",
    cracking:
      "Your cover story no longer holds up. In character, admit the specific lie the detective has exposed and tell the truth behind it from your secret. Depending on your personality you may be defiant, tearful, bitter or relieved. If your secret is the crime itself, you can minimise or make excuses, but no longer deny what the evidence proves.",
  };
  const instructions = `You are ${cap(s.name, 80)}, ${cap(s.role, 120)}. You are being questioned by a detective.
CASE (public): ${cap(t.incident.title, 120)}. ${cap(t.incident.setting, 300)}. ${cap(t.incident.victimOrIncident, 800)}
YOUR PERSONALITY: ${cap(s.personality, 400)}

WHAT YOU TRULY KNOW:
${(s.knows ?? []).slice(0, 12).map((k) => `- ${cap(k, 300)}`).join("\n")}

YOUR SECRET (never volunteer it): ${cap(s.secret, 500)}
YOUR COVER STORY (tell it whenever the topic comes up and keep it consistent): ${cap(s.lie, 500)}

EVIDENCE THE DETECTIVE HAS SHOWN YOU SO FAR:
${t.shownEvidence.length ? t.shownEvidence.map((e) => `- ${cap(e.label, 80)}: ${cap(e.description, 300)}`).join("\n") : "- nothing yet"}

CURRENT STATE: ${stateText[t.state]}

RULES:
- Reply as spoken dialogue only: 1 to 3 short sentences, first person. No stage directions, no asterisks, no narration, no quotation marks around your reply.
- You only know what is listed above plus what the detective has said or shown you. For small details not covered, improvise plausibly and stay consistent with everything you have already said in this conversation.
- Never invent new facts that would solve the case, and never reveal your secret unless your state says you are cracking.
- Do not confess just because you are accused or pressured. Only evidence you can't explain breaks you.
- Answer what was asked. If the question is vague or packs several questions together, you may dodge part of it, as a real witness would.
- Never mention that you are an AI, a game or a prompt.`;

  const input: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of t.history.slice(-24)) {
    input.push({ role: "user", content: h.shown ? `[The detective shows you: ${cap(h.shown, 200)}] ${cap(h.q, 600)}` : cap(h.q, 600) });
    input.push({ role: "assistant", content: cap(h.a, 600) });
  }
  input.push({
    role: "user",
    content: t.present
      ? `[The detective shows you: ${cap(t.present.label, 80)}: ${cap(t.present.description, 300)}] ${cap(t.question, 600) || "Explain this."}`
      : cap(t.question, 600),
  });
  return { instructions, input };
}

/** Tidy a suspect reply for speech: strip stage directions and keep it short. */
export function cleanReply(text: string): string {
  let t = text
    .replace(/\*[^*]{0,120}\*/g, " ")
    .replace(/\([^)]{0,80}\)/g, " ")
    .replace(/^\s*["“]|["”]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > 420) {
    const cut = t.slice(0, 420);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    t = end > 80 ? cut.slice(0, end + 1) : cut + "…";
  }
  return t || "...";
}

// ---------- Contradiction check (Muse Spark) ----------

const strArr = { type: "array", items: { type: "string" } } as const;

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    claims: strArr,
    contradictsWith: strArr,
    stressDelta: { type: "integer" },
    questionTags: { type: "array", items: { type: "string", enum: QUESTION_TAGS } },
    surfacedContradictionIds: strArr,
  },
  required: ["claims", "contradictsWith", "stressDelta", "questionTags", "surfacedContradictionIds"],
  additionalProperties: false,
};

export type AnalysisResult = {
  claims: string[];
  contradictsWith: string[];
  stressDelta: number;
  questionTags: QuestionTag[];
  surfacedContradictionIds: string[];
};

export const ANALYSIS_INSTRUCTIONS = `You are the contradiction engine of a cross-examination trainer. You analyse ONE turn: the detective's question and a suspect's answer. Return JSON:
- claims: the atomic factual claims in the ANSWER (short, third person, e.g. "Owen says he was in the basement from 8:30 to 9:40"). Skip opinions and filler. Empty if none.
- contradictsWith: references to PRIOR claims or EVIDENCE that cannot be true at the same time as a claim in this answer. Use only refs given in the input ("claim:..." or "evidence:e3"). Include a suspect contradicting their own earlier claims, other suspects' claims, or evidence facts. Empty if none.
- stressDelta: integer from -10 to 30. Raise it when the question is pointed, uses evidence, or catches the suspect out; raise it most when the suspect is caught in a contradiction. Lower it slightly for soft, unfocused or repetitive questions.
- questionTags: tags for the DETECTIVE'S QUESTION. "open" = invites a narrative (what, where, how, why, describe, walk me through). "leading" = suggests its own answer (yes/no, "you were there, weren't you?"). "followup" = builds on the suspect's previous answer. "evidence" = refers to or presents a specific piece of evidence. "compound" = asks two or more things at once. Use one or more.
- surfacedContradictionIds: ids of KEY CONTRADICTIONS that this turn exposed: the detective's question or presented evidence put the suspect's false statement directly against the conflicting fact, or the suspect stated the false claim right after being confronted with the conflicting evidence. Do not include one merely because the suspect told the lie unprompted. Empty if none.`;

// ---------- Debrief (Muse Wonder) ----------

export const ERROR_LABELS: ReasoningErrorLabel[] = [
  "accepted_without_checking",
  "stopped_at_first_answer",
  "no_followup_on_vague",
  "compound_question",
  "evidence_not_presented",
  "never_asked",
];

export const DEBRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    tip: { type: "string" },
    missed: {
      type: "array",
      items: {
        type: "object",
        properties: {
          contradictionId: { type: "string" },
          errorLabel: { type: "string", enum: ERROR_LABELS },
          errorExplanation: { type: "string" },
        },
        required: ["contradictionId", "errorLabel", "errorExplanation"],
        additionalProperties: false,
      },
    },
    caughtNotes: {
      type: "array",
      items: {
        type: "object",
        properties: { contradictionId: { type: "string" }, how: { type: "string" } },
        required: ["contradictionId", "how"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "tip", "missed", "caughtNotes"],
  additionalProperties: false,
};

export type DebriefAI = {
  summary: string;
  tip: string;
  missed: { contradictionId: string; errorLabel: ReasoningErrorLabel; errorExplanation: string }[];
  caughtNotes: { contradictionId: string; how: string }[];
};

export const DEBRIEF_INSTRUCTIONS = `You are a cross-examination coach (think debate or moot-court coach) writing the debrief after a practice case. You get structured data only: the verdict, the score breakdown, the key contradictions the player caught and missed, a statement ledger excerpt, and questioning statistics.
Return JSON:
- summary: 2 to 3 sentences on how the cross-examination went overall. Be specific, reference actual moments from the ledger, and be honest but encouraging. Speak to the player as "you".
- tip: ONE concrete, actionable technique for the next case, tied to their weakest habit (e.g. "When a witness gives a time, lock it in with a follow-up before you show the evidence that breaks it.").
- missed: for EACH missed contradiction id, choose the single best errorLabel and write errorExplanation, one sentence on what the player did or didn't do. Labels: accepted_without_checking (heard the false claim but never tested it against evidence), stopped_at_first_answer (asked once and moved on), no_followup_on_vague (let a vague or evasive answer stand), compound_question (asked several things at once so the suspect dodged), evidence_not_presented (had the exposing evidence but never showed it to this suspect), never_asked (never questioned the suspect on this topic).
- caughtNotes: for EACH caught contradiction id, one short sentence on how the player exposed it.`;
