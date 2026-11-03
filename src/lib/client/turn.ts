"use client";
// One interrogation turn, orchestrated in the browser:
// 1) the suspect agent replies (Muse Wonder), 2) the contradiction engine analyses it (Muse Spark) in the background.
import { breaksNow, crackState, heuristicClaims, heuristicTags, offlineReply, ruleSurfaced } from "@/lib/game";
import type { CaseFile, LedgerEntry, Session } from "@/lib/types";
import { ApiError, postJson } from "./api";

export async function askSuspect(opts: {
  caseFile: CaseFile;
  session: Session;
  suspectId: string;
  question: string;
  presentEvidenceId?: string;
  allowOffline: boolean;
  signal?: AbortSignal;
}): Promise<{ answer: string; offline: boolean; state: "calm" | "nervous" | "cracking" }> {
  const { caseFile: c, session, suspectId } = opts;
  const s = c.suspects.find((x) => x.id === suspectId)!;
  const stress = session.stress?.[suspectId] ?? 0;
  const cracked = Boolean(session.cracked?.[suspectId]) || breaksNow(s, opts.presentEvidenceId);
  const state = crackState(stress, cracked);
  const ev = (id: string) => c.evidence.find((e) => e.id === id);
  const mine = session.ledger.filter((e) => e.suspectId === suspectId);
  const shownIds = [...new Set(session.presentedEvidence.filter((p) => p.suspectId === suspectId).map((p) => p.evidenceId))];
  const present = opts.presentEvidenceId ? ev(opts.presentEvidenceId) : undefined;

  try {
    // Only this suspect's own record plus what the player said/showed is sent. Never the truth or other secrets.
    const r = await postJson<{ answer: string }>(
      "/api/suspect",
      {
        incident: { title: c.title, setting: c.setting, victimOrIncident: c.victimOrIncident },
        suspect: { name: s.name, role: s.role, personality: s.personality, knows: s.knows, secret: s.secret, lie: s.lie },
        history: mine.map((e) => ({ q: e.playerQuestion, a: e.suspectAnswer, shown: e.presentedEvidenceId ? ev(e.presentedEvidenceId)?.label : undefined })),
        shownEvidence: shownIds.map((id) => ev(id)).filter(Boolean).map((e) => ({ label: e!.label, description: e!.description })),
        question: opts.question,
        present: present ? { label: present.label, description: present.description } : undefined,
        state,
      },
      opts.signal,
    );
    return { answer: r.answer, offline: false, state };
  } catch (err) {
    if (opts.allowOffline && err instanceof ApiError && err.code !== "cancelled" && err.code !== "rate_limited") {
      return { answer: offlineReply(s, opts.question, state, present?.label), offline: true, state };
    }
    throw err;
  }
}

type Analysis = {
  claims: string[];
  contradictsWith: string[];
  stressDelta: number;
  questionTags: LedgerEntry["questionTags"];
  surfacedContradictionIds: string[];
};

export async function analyzeTurn(opts: { caseFile: CaseFile; session: Session; entry: LedgerEntry; offline: boolean; signal?: AbortSignal }): Promise<Partial<LedgerEntry> & { stressDelta: number }> {
  const { caseFile: c, session, entry } = opts;
  const mine = session.ledger.filter((e) => e.suspectId === entry.suspectId && e.turn < entry.turn);
  const previous = mine[mine.length - 1];
  const rule = ruleSurfaced(c, entry.suspectId, entry.presentedEvidenceId);
  const heur = heuristicTags(entry.playerQuestion, previous?.suspectAnswer, Boolean(entry.presentedEvidenceId));
  const offlineResult = () => ({
    claimsExtracted: heuristicClaims(entry.suspectAnswer),
    contradictsWith: [],
    questionTags: heur,
    surfacedContradictionIds: rule,
    stressDelta: entry.presentedEvidenceId ? 15 : 4,
    analysis: "offline" as const,
  });
  if (opts.offline) return offlineResult();

  const suspectName = (id: string) => c.suspects.find((s) => s.id === id)?.name ?? id;
  const priorClaims = session.ledger
    .filter((e) => e.id !== entry.id)
    .flatMap((e) => e.claimsExtracted.map((claim, i) => ({ ref: `claim:${e.id}#${i}`, suspectName: suspectName(e.suspectId), claim })));
  const pe = entry.presentedEvidenceId ? c.evidence.find((e) => e.id === entry.presentedEvidenceId) : undefined;
  try {
    const r = await postJson<Analysis>(
      "/api/analyze",
      {
        suspect: { id: entry.suspectId, name: suspectName(entry.suspectId) },
        question: entry.playerQuestion,
        presentedEvidence: pe ? { id: pe.id, label: pe.label, description: pe.description } : undefined,
        answer: entry.suspectAnswer,
        previous: previous ? { q: previous.playerQuestion, a: previous.suspectAnswer } : undefined,
        priorClaims,
        evidence: c.evidence.map((e) => ({ id: e.id, label: e.label, description: e.description })),
        keyContradictions: c.solution.keyContradictions,
        stress: session.stress?.[entry.suspectId] ?? 0,
      },
      opts.signal,
    );
    const tags = new Set(r.questionTags.length ? r.questionTags : heur);
    if (entry.presentedEvidenceId) tags.add("evidence");
    return {
      claimsExtracted: r.claims,
      contradictsWith: r.contradictsWith,
      questionTags: [...tags],
      surfacedContradictionIds: [...new Set([...r.surfacedContradictionIds, ...rule])],
      stressDelta: r.stressDelta,
      analysis: "done",
    };
  } catch {
    return { ...offlineResult(), analysis: "failed" };
  }
}
