import type { CaseFile, Contradiction } from "@/lib/types";
import type { RawCase } from "./case-prompts";

const clamp = (v: number, lo: number, hi: number, d: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

export function newCaseId() {
  return `case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Turn the model's raw JSON into a CaseFile. Repairs trivial problems and reports structural ones,
 * which are fed back to the model as repair issues.
 */
export function normalizeCase(raw: RawCase, id = newCaseId()): { caseFile: CaseFile; problems: string[] } {
  const problems: string[] = [];
  const suspects = Array.isArray(raw.suspects) ? raw.suspects : [];
  const evidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  const suspectIds = new Set(suspects.map((s) => s.id));
  const evidenceIds = new Set(evidence.map((e) => e.id));
  const kcs = Array.isArray(raw.solution?.keyContradictions) ? raw.solution.keyContradictions : [];
  const contradictionIds = new Set(kcs.map((c) => c.id));

  if (suspects.length < 3 || suspects.length > 4) problems.push(`There must be 3 or 4 suspects (got ${suspects.length}).`);
  if (suspectIds.size !== suspects.length) problems.push("Suspect ids must be unique.");
  if (evidence.length < 5 || evidence.length > 8) problems.push(`There must be 5 to 8 evidence items (got ${evidence.length}).`);
  if (evidenceIds.size !== evidence.length) problems.push("Evidence ids must be unique.");
  if (!suspectIds.has(raw.truth?.culpritId)) problems.push("truth.culpritId must be one of the suspect ids.");

  const sceneItems = evidence.filter((e) => e.foundIn === "scene");
  if (sceneItems.length < 2) problems.push("At least 3 evidence items should be physical objects found in the scene.");
  for (const e of sceneItems) {
    if (!e.sceneRegionHint?.trim()) problems.push(`Scene evidence ${e.id} needs a sceneRegionHint noun phrase.`);
  }

  const required = (raw.solution?.requiredEvidenceIds ?? []).filter((x) => evidenceIds.has(x));
  if (required.length < 2) problems.push("solution.requiredEvidenceIds needs 2 to 3 valid evidence ids.");
  if (kcs.length < 2) problems.push("solution.keyContradictions needs 3 to 5 items.");
  const culpritKcs = kcs.filter((c) => c.suspectId === raw.truth?.culpritId);
  if (culpritKcs.length < 2) problems.push("At least 2 key contradictions must expose the culprit.");
  for (const c of kcs) {
    if (!suspectIds.has(c.suspectId)) problems.push(`Contradiction ${c.id} references unknown suspect ${c.suspectId}.`);
    if (!(c.evidenceIds ?? []).some((x) => evidenceIds.has(x))) problems.push(`Contradiction ${c.id} must cite at least one valid evidence id.`);
  }

  const keyContradictions: Contradiction[] = kcs.map((c) => {
    const suspect = suspects.find((s) => s.id === c.suspectId);
    return {
      id: c.id,
      between: [suspect ? `${suspect.name}: "${c.statement}"` : c.statement, c.conflictsWith],
      explanation: c.explanation,
      suspectId: c.suspectId,
      evidenceIds: (c.evidenceIds ?? []).filter((x) => evidenceIds.has(x)),
    };
  });

  const caseFile: CaseFile = {
    id,
    title: raw.title?.trim() || "Untitled Case",
    setting: raw.setting ?? "",
    victimOrIncident: raw.victimOrIncident ?? "",
    truth: {
      culpritId: raw.truth?.culpritId,
      motive: raw.truth?.motive ?? "",
      method: raw.truth?.method ?? "",
      timeline: (raw.truth?.timeline ?? []).map((t) => ({
        time: t.time,
        event: t.event,
        witnessIds: (t.witnessIds ?? []).filter((w) => suspectIds.has(w)),
      })),
    },
    suspects: suspects.map((s, i) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      personality: s.personality,
      voice: {
        pitch: clamp(s.voicePitch, 0.5, 1.5, 0.8 + i * 0.2),
        rate: clamp(s.voiceRate, 0.8, 1.2, 1),
        voiceHint: s.voiceHint,
      },
      portrait: { prompt: s.portraitPrompt, imageKey: `${id}/portrait-${s.id}` },
      knows: (s.knows ?? []).filter(Boolean),
      secret: s.secret,
      lie: s.lie,
      breaksOn: (s.breaksOn ?? []).filter((x) => evidenceIds.has(x) || contradictionIds.has(x)),
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      label: e.label,
      description: e.description,
      imagePrompt: e.imagePrompt?.trim() || undefined,
      imageKey: e.imagePrompt?.trim() ? `${id}/evidence-${e.id}` : undefined,
      relatesTo: e.relatesTo ?? [],
      sceneRegionHint: e.foundIn === "scene" && e.sceneRegionHint?.trim() ? e.sceneRegionHint.trim() : undefined,
    })),
    solution: { requiredEvidenceIds: required, keyContradictions },
    scene: { prompt: raw.scenePrompt, imageKey: `${id}/scene` },
    createdAt: Date.now(),
    source: "generated",
  };

  // Make sure every suspect can crack on something: fall back to the contradictions that expose them.
  for (const s of caseFile.suspects) {
    if (s.breaksOn.length === 0) {
      const mine = keyContradictions.filter((c) => c.suspectId === s.id);
      s.breaksOn = [...mine.map((c) => c.id), ...mine.flatMap((c) => c.evidenceIds ?? [])];
    }
  }

  return { caseFile, problems };
}
