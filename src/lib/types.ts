// Core data model for Cold Case. Stored as JSON (IndexedDB on the client).

export type CaseFile = {
  id: string;
  title: string;
  setting: string; // where/when
  victimOrIncident: string; // what happened, public version
  truth: {
    // HIDDEN from the player and never put in a suspect prompt
    culpritId: string;
    motive: string;
    method: string;
    timeline: { time: string; event: string; witnessIds: string[] }[];
  };
  suspects: Suspect[]; // 3 to 4
  evidence: Evidence[]; // 5 to 8 items
  solution: {
    requiredEvidenceIds: string[];
    keyContradictions: Contradiction[];
  };
  scene: { prompt: string; imageKey: string };
  /** SAM 3.1 masks for each scene evidence item, located once after the scene image exists. */
  sceneLocations?: Record<string, SamObject | null>;
  createdAt?: number;
  source?: "generated" | "demo";
};

export type Suspect = {
  id: string;
  name: string;
  role: string;
  personality: string; // drives voice params and tone
  voice: { pitch: number; rate: number; voiceHint?: string };
  portrait: { prompt: string; imageKey: string };
  knows: string[]; // facts this suspect truly knows (first person)
  secret: string; // what they are hiding (first person)
  lie: string; // the false story they will tell (first person)
  breaksOn: string[]; // evidence/contradiction ids that make them crack
};

export type Evidence = {
  id: string;
  label: string;
  description: string;
  imageKey?: string;
  imagePrompt?: string;
  relatesTo: string[]; // suspect ids / timeline events
  sceneRegionHint?: string; // short noun phrase for SAM to find it in the scene image
};

export type Contradiction = {
  id: string;
  between: [string, string]; // two statements/evidence that cannot both be true
  explanation: string;
  suspectId?: string; // whose statement is exposed
  evidenceIds?: string[]; // evidence that exposes it
};

export type QuestionTag = "open" | "leading" | "followup" | "evidence" | "compound";
export const QUESTION_TAGS: QuestionTag[] = ["open", "leading", "followup", "evidence", "compound"];

export type LedgerEntry = {
  id: string; // `${suspectId}-t${turn}`
  suspectId: string;
  turn: number;
  playerQuestion: string;
  presentedEvidenceId?: string;
  suspectAnswer: string;
  claimsExtracted: string[]; // atomic factual claims from the answer
  contradictsWith?: string[]; // "evidence:e3" | "claim:<entryId>#<i>"
  stress: number; // 0 to 100 after this turn
  questionTags: QuestionTag[];
  surfacedContradictionIds?: string[]; // key contradictions exposed this turn (hidden until debrief)
  analysis?: "pending" | "done" | "offline" | "failed";
  offline?: boolean; // answer produced by the offline fallback
  at?: number;
};

export type Session = {
  caseId: string;
  ledger: LedgerEntry[];
  collectedEvidenceIds: string[];
  presentedEvidence: { evidenceId: string; suspectId: string; turn: number }[];
  accusation?: {
    suspectId: string;
    evidenceIds: string[];
    reasoning: string;
    statementIds?: string[];
  };
  result?: Debrief;
  stress?: Record<string, number>;
  cracked?: Record<string, boolean>;
  startedAt?: number;
};

export type ReasoningErrorLabel =
  | "accepted_without_checking"
  | "stopped_at_first_answer"
  | "no_followup_on_vague"
  | "compound_question"
  | "evidence_not_presented"
  | "never_asked";

export const REASONING_ERROR_TEXT: Record<ReasoningErrorLabel, string> = {
  accepted_without_checking: "Accepted a claim without checking it against the evidence",
  stopped_at_first_answer: "Stopped at the first answer",
  no_followup_on_vague: "Did not follow up on a vague answer",
  compound_question: "Asked a compound question, which let them dodge part of it",
  evidence_not_presented: "Had the evidence but never put it to the suspect",
  never_asked: "Never questioned the suspect on this point",
};

export type QuestionStats = {
  questions: number;
  openRate: number;
  leadingRate: number;
  followupRate: number;
  evidenceRate: number;
  compoundRate: number;
  avgQuestionWords: number;
};

export type Debrief = {
  verdict: "solved" | "wrong_culprit" | "partial";
  score: number;
  breakdown: { culprit: number; evidence: number; contradictions: number; questioning: number };
  culpritCorrect: boolean;
  citedRequired: string[];
  caught: {
    contradictionId: string;
    between: [string, string];
    explanation: string;
    how: string;
  }[];
  missed: {
    contradictionId: string;
    between: [string, string];
    explanation: string;
    errorLabel: ReasoningErrorLabel;
    errorExplanation: string;
  }[];
  otherInconsistencies: { entryId: string; suspectName: string; claim: string; conflictsWith: string; followedUp: boolean }[];
  stats: QuestionStats;
  tip: string;
  summary: string;
  truthReveal: string;
  generatedBy: "muse-wonder" | "fallback";
  at: number;
};

export type ProgressSummary = {
  caseId: string;
  title: string;
  at: number;
  score: number;
  solved: boolean;
  caught: number;
  totalContradictions: number;
  openRate: number;
  followupRate: number;
  questions: number;
  xp?: number;
  grade?: string;
};

/** A SAM 3.1 object in source-image pixels. Mask covers the box region; bits are packed row-major, base64. */
export type SamObject = {
  box: [number, number, number, number]; // left, top, right, bottom (half-open)
  imageWidth: number;
  imageHeight: number;
  mask?: { width: number; height: number; bits: string };
};

export type ApiErrorBody = { error: string; code?: string; retryable?: boolean };
