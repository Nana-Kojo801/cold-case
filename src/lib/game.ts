// Pure game logic shared by client and server: crack state, heuristics, scoring and the fallback debrief.
import {
  REASONING_ERROR_TEXT,
  type CaseFile,
  type Debrief,
  type LedgerEntry,
  type QuestionStats,
  type QuestionTag,
  type ReasoningErrorLabel,
  type Session,
  type Suspect,
} from "./types";

export const CRACK_THRESHOLD = 70;
export const NERVOUS_THRESHOLD = 40;

export function crackState(stress: number, cracked: boolean): "calm" | "nervous" | "cracking" {
  if (cracked || stress >= CRACK_THRESHOLD) return "cracking";
  if (stress >= NERVOUS_THRESHOLD) return "nervous";
  return "calm";
}

export function emptySession(caseId: string): Session {
  return { caseId, ledger: [], collectedEvidenceIds: [], presentedEvidence: [], stress: {}, cracked: {}, startedAt: Date.now() };
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
const STOP = new Set(
  "the a an and or but of to in on at for with you your i me my was were is are did do does what where when why how who that this it be been have had has there their they them he she his her we our from about into not no yes so if then than just tell".split(
    " ",
  ),
);
const content = (s: string) => words(s).filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

/** Heuristic question tags, used offline and to sanity-check the model's tags. */
export function heuristicTags(question: string, prevAnswer: string | undefined, presented: boolean): QuestionTag[] {
  const q = question.trim().toLowerCase();
  const tags = new Set<QuestionTag>();
  if (presented) tags.add("evidence");
  const qMarks = (q.match(/\?/g) ?? []).length;
  if (qMarks >= 2 || /\?\s*(and|also)\b/.test(q) || /\b(and|also) (what|where|when|why|how|who|did|were|was)\b/.test(q)) tags.add("compound");
  if (/^(what|where|when|why|how|who|which|describe|tell me|walk me|explain)\b/.test(q)) tags.add("open");
  if (/^(did|do|does|were|was|is|are|have|had|has|can|could|would|will|isn't|wasn't|weren't|didn't|aren't)\b/.test(q) || /,\s*(right|didn't you|weren't you|wasn't it|isn't it)\??$/.test(q))
    tags.add("leading");
  if (prevAnswer) {
    const prev = new Set(content(prevAnswer));
    const overlap = content(question).filter((w) => prev.has(w)).length;
    if (overlap >= 2 || /^(so|and|but|then|earlier|you said|you just said|wait)\b/.test(q)) tags.add("followup");
  }
  if (tags.size === 0) tags.add(q.endsWith("?") ? "leading" : "open");
  return [...tags];
}

/** Rough claim split for offline mode: the answer's sentences. */
export function heuristicClaims(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
    .slice(0, 4);
}

/**
 * Deterministic surfacing rule (runs alongside the model's judgment): presenting evidence that exposes a
 * key contradiction to the suspect it exposes counts as surfacing it.
 */
export function ruleSurfaced(c: CaseFile, suspectId: string, presentedEvidenceId?: string): string[] {
  if (!presentedEvidenceId) return [];
  return c.solution.keyContradictions
    .filter((k) => k.suspectId === suspectId && (k.evidenceIds ?? []).includes(presentedEvidenceId))
    .map((k) => k.id);
}

export function breaksNow(s: Suspect, presentedEvidenceId?: string): boolean {
  return Boolean(presentedEvidenceId && s.breaksOn.includes(presentedEvidenceId));
}

/** Offline fallback reply built from the suspect's own record (used when the AI is unavailable). */
export function offlineReply(s: Suspect, question: string, state: "calm" | "nervous" | "cracking", presentedLabel?: string): string {
  if (state === "cracking") {
    return `${presentedLabel ? "...Fine. " : "Alright, alright. "}${s.secret}`;
  }
  const q = question.toLowerCase();
  if (/\b(where|when|time|doing|alibi|night|evening|after|before|during|whereabouts|were you)\b/.test(q)) {
    return state === "nervous" ? `I've told you already. ${s.lie}` : s.lie;
  }
  const qw = new Set(content(question).map(stem));
  // Never volunteer a fact that touches the secret: for the culprit, "knows" includes the crime itself.
  const secretWords = new Set(content(s.secret).map(stem));
  let best = "";
  let bestScore = 0;
  for (const k of s.knows) {
    const kw = content(k).map(stem);
    if (k === s.secret || new Set(kw.filter((w) => secretWords.has(w))).size >= 2) continue;
    const score = kw.filter((w) => qw.has(w)).length;
    if (score > bestScore) {
      best = k;
      bestScore = score;
    }
  }
  if (!best && content(s.lie).map(stem).some((w) => qw.has(w))) return state === "nervous" ? `Like I said. ${s.lie}` : s.lie;
  if (presentedLabel && !best) return `I don't know anything about that ${presentedLabel.toLowerCase()}. ${s.lie}`;
  if (best) return best;
  return state === "nervous" ? "I don't see what that has to do with anything." : "I'm not sure what you're asking. Ask me something specific.";
}

// ---------- Scoring ----------

export function questionStats(ledger: LedgerEntry[]): QuestionStats {
  const qs = ledger.filter((e) => e.playerQuestion.trim() || e.presentedEvidenceId);
  const n = qs.length || 1;
  const rate = (t: QuestionTag) => qs.filter((e) => e.questionTags.includes(t)).length / n;
  const totalWords = qs.reduce((a, e) => a + words(e.playerQuestion).length, 0);
  return {
    questions: qs.length,
    openRate: rate("open"),
    leadingRate: rate("leading"),
    followupRate: rate("followup"),
    evidenceRate: rate("evidence"),
    compoundRate: rate("compound"),
    avgQuestionWords: qs.length ? totalWords / qs.length : 0,
  };
}

export function surfacedIds(session: Session): Set<string> {
  return new Set(session.ledger.flatMap((e) => e.surfacedContradictionIds ?? []));
}

/** Deterministic part of the debrief: verdict, score, caught/missed, labels, stats. */
export function scoreSession(c: CaseFile, session: Session): Debrief {
  const acc = session.accusation;
  const culpritCorrect = acc?.suspectId === c.truth.culpritId;
  const cited = new Set(acc?.evidenceIds ?? []);
  const citedRequired = c.solution.requiredEvidenceIds.filter((id) => cited.has(id));
  const surfaced = surfacedIds(session);
  // Statements cited in the accusation that carried a surfaced contradiction also count.
  for (const id of acc?.statementIds ?? []) {
    const e = session.ledger.find((x) => x.id === id);
    for (const k of e?.surfacedContradictionIds ?? []) surfaced.add(k);
  }
  const kcs = c.solution.keyContradictions;
  const stats = questionStats(session.ledger);
  const nameOf = (id?: string) => c.suspects.find((s) => s.id === id)?.name ?? "the suspect";

  const caught: Debrief["caught"] = [];
  const missed: Debrief["missed"] = [];
  for (const k of kcs) {
    if (surfaced.has(k.id)) {
      const turn = session.ledger.find((e) => e.surfacedContradictionIds?.includes(k.id));
      caught.push({
        contradictionId: k.id,
        between: k.between,
        explanation: k.explanation,
        how: turn
          ? turn.presentedEvidenceId
            ? `You showed ${nameOf(k.suspectId)} the ${c.evidence.find((e) => e.id === turn.presentedEvidenceId)?.label ?? "evidence"} on turn ${turn.turn}.`
            : `Your question on turn ${turn.turn} put it to ${nameOf(k.suspectId)}.`
          : "You cited it in your accusation.",
      });
    } else {
      const label = fallbackLabel(c, session, k.suspectId, k.evidenceIds ?? []);
      missed.push({ contradictionId: k.id, between: k.between, explanation: k.explanation, errorLabel: label, errorExplanation: REASONING_ERROR_TEXT[label] + "." });
    }
  }

  const culprit = culpritCorrect ? 40 : 0;
  const evidence = Math.round(25 * (citedRequired.length / Math.max(1, c.solution.requiredEvidenceIds.length)));
  const contradictions = Math.round(25 * (caught.length / Math.max(1, kcs.length)));
  // Quality only counts in proportion to effort: full marks need at least 8 questions.
  const effort = Math.min(1, stats.questions / 8);
  const questioning = stats.questions
    ? Math.round(10 * effort * (0.4 * Math.min(1, stats.openRate / 0.5) + 0.4 * Math.min(1, stats.followupRate / 0.35) + 0.2 * (1 - Math.min(1, stats.compoundRate / 0.3))))
    : 0;
  const score = culprit + evidence + contradictions + questioning;
  const verdict: Debrief["verdict"] = !culpritCorrect ? "wrong_culprit" : citedRequired.length === c.solution.requiredEvidenceIds.length ? "solved" : "partial";

  // Emergent inconsistencies flagged by the contradiction engine during play.
  const otherInconsistencies: Debrief["otherInconsistencies"] = [];
  session.ledger.forEach((e, i) => {
    for (const ref of e.contradictsWith ?? []) {
      const next = session.ledger.slice(i + 1).find((x) => x.suspectId === e.suspectId);
      otherInconsistencies.push({
        entryId: e.id,
        suspectName: nameOf(e.suspectId),
        claim: e.claimsExtracted[0] ?? e.suspectAnswer,
        conflictsWith: describeRef(c, session, ref),
        followedUp: Boolean(next && (next.questionTags.includes("followup") || next.questionTags.includes("evidence"))),
      });
    }
  });

  const culpritName = nameOf(c.truth.culpritId);
  return {
    verdict,
    score,
    breakdown: { culprit, evidence, contradictions, questioning },
    culpritCorrect,
    citedRequired,
    caught,
    missed,
    otherInconsistencies: otherInconsistencies.slice(0, 8),
    stats,
    tip: fallbackTip(stats, missed),
    summary: culpritCorrect
      ? `You named ${culpritName}, the right suspect. You surfaced ${caught.length} of ${kcs.length} key contradictions in ${stats.questions} questions.`
      : `${culpritName} was the culprit, not ${nameOf(acc?.suspectId)}. You surfaced ${caught.length} of ${kcs.length} key contradictions in ${stats.questions} questions.`,
    truthReveal: `${culpritName} did it. Motive: ${c.truth.motive} Method: ${c.truth.method}`,
    generatedBy: "fallback",
    at: Date.now(),
  };
}

function fallbackLabel(c: CaseFile, session: Session, suspectId: string | undefined, evidenceIds: string[]): ReasoningErrorLabel {
  const turns = session.ledger.filter((e) => e.suspectId === suspectId);
  if (turns.length === 0) return "never_asked";
  const hadEvidence = evidenceIds.some((id) => session.collectedEvidenceIds.includes(id));
  const presented = session.presentedEvidence.some((p) => p.suspectId === suspectId && evidenceIds.includes(p.evidenceId));
  if (hadEvidence && !presented) return "evidence_not_presented";
  if (turns.length <= 2) return "stopped_at_first_answer";
  if (turns.filter((t) => t.questionTags.includes("compound")).length >= 2) return "compound_question";
  if (!turns.some((t) => t.questionTags.includes("followup"))) return "no_followup_on_vague";
  return "accepted_without_checking";
}

function fallbackTip(stats: QuestionStats, missed: Debrief["missed"]): string {
  if (stats.questions < 4) return "Ask more questions before accusing. Pin each suspect to times and places first, then test those claims.";
  if (missed.some((m) => m.errorLabel === "evidence_not_presented"))
    return "Once a suspect commits to a story, show them the evidence that contradicts it and make them explain the gap.";
  if (stats.compoundRate > 0.25) return "Ask one thing at a time. Compound questions let a witness answer the easy half and skip the rest.";
  if (stats.followupRate < 0.3) return "Follow up. When an answer is vague, repeat their own words back and ask for the specific time, place or person.";
  if (stats.openRate < 0.3) return "Open with open questions (what, where, walk me through it) to get them committed to details before you lead.";
  return "Lock in a precise claim with a follow-up before you reveal the evidence that breaks it.";
}

export function describeRef(c: CaseFile, session: Session, ref: string): string {
  if (ref.startsWith("evidence:")) {
    const e = c.evidence.find((x) => x.id === ref.slice(9));
    return e ? `Evidence: ${e.label}` : ref;
  }
  if (ref.startsWith("claim:")) {
    const [entryId, idx] = ref.slice(6).split("#");
    const e = session.ledger.find((x) => x.id === entryId);
    if (!e) return ref;
    const name = c.suspects.find((s) => s.id === e.suspectId)?.name ?? "";
    return `${name}, turn ${e.turn}: ${e.claimsExtracted[Number(idx)] ?? e.suspectAnswer}`;
  }
  return ref;
}

export function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

// ---------- Ranks, XP and grades ----------

export const RANKS = [
  { name: "Rookie", min: 0 },
  { name: "Detective", min: 250 },
  { name: "Detective Sergeant", min: 500 },
  { name: "Inspector", min: 1000 },
  { name: "Chief Inspector", min: 1800 },
  { name: "Superintendent", min: 3000 },
];

export function rankFor(xp: number) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1];
  return { name: RANKS[i].name, index: i, xp, nextName: next?.name ?? null, nextAt: next?.min ?? null, progress: next ? xp / next.min : 1 };
}

export function gradeFor(score: number): string {
  const table: [number, string][] = [[95, "A+"], [90, "A"], [85, "A−"], [80, "B+"], [75, "B"], [70, "B−"], [65, "C+"], [60, "C"], [55, "C−"], [45, "D"]];
  return table.find(([min]) => score >= min)?.[1] ?? "F";
}

export function xpFor(score: number, solved: boolean) {
  return Math.round(score * 2.5) + (solved ? 25 : 0);
}

export function totalXp(items: { score: number; solved: boolean; xp?: number }[]) {
  return items.reduce((a, p) => a + (p.xp ?? xpFor(p.score, p.solved)), 0);
}
