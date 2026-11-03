// Case generation (Muse Wonder) and solvability validation (Muse Spark): prompts and JSON schemas.
// Schemas are strict: every property required, no additional properties. Optional values use "" or [].

const str = { type: "string" } as const;
const strArr = { type: "array", items: { type: "string" } } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const CASE_SCHEMA = obj({
  title: str,
  setting: str,
  victimOrIncident: str,
  truth: obj({
    culpritId: str,
    motive: str,
    method: str,
    timeline: { type: "array", items: obj({ time: str, event: str, witnessIds: strArr }) },
  }),
  suspects: {
    type: "array",
    items: obj({
      id: str,
      name: str,
      role: str,
      personality: str,
      voiceHint: { type: "string", enum: ["female", "male", "neutral"] },
      voicePitch: { type: "number" },
      voiceRate: { type: "number" },
      portraitPrompt: str,
      knows: strArr,
      secret: str,
      lie: str,
      breaksOn: strArr,
    }),
  },
  evidence: {
    type: "array",
    items: obj({
      id: str,
      label: str,
      description: str,
      foundIn: { type: "string", enum: ["scene", "file"] },
      sceneRegionHint: str,
      imagePrompt: str,
      relatesTo: strArr,
    }),
  },
  solution: obj({
    requiredEvidenceIds: strArr,
    keyContradictions: {
      type: "array",
      items: obj({
        id: str,
        suspectId: str,
        statement: str,
        conflictsWith: str,
        evidenceIds: strArr,
        explanation: str,
      }),
    },
  }),
  scenePrompt: str,
});

export type RawCase = {
  title: string;
  setting: string;
  victimOrIncident: string;
  truth: { culpritId: string; motive: string; method: string; timeline: { time: string; event: string; witnessIds: string[] }[] };
  suspects: {
    id: string;
    name: string;
    role: string;
    personality: string;
    voiceHint: "female" | "male" | "neutral";
    voicePitch: number;
    voiceRate: number;
    portraitPrompt: string;
    knows: string[];
    secret: string;
    lie: string;
    breaksOn: string[];
  }[];
  evidence: {
    id: string;
    label: string;
    description: string;
    foundIn: "scene" | "file";
    sceneRegionHint: string;
    imagePrompt: string;
    relatesTo: string[];
  }[];
  solution: {
    requiredEvidenceIds: string[];
    keyContradictions: { id: string; suspectId: string; statement: string; conflictsWith: string; evidenceIds: string[]; explanation: string }[];
  };
  scenePrompt: string;
};

export const CASE_INSTRUCTIONS = `You are the case architect for "Cold Case", a cross-examination training game disguised as a detective game.
You write ONE complete, fair, SOLVABLE mystery as strict JSON matching the schema. The player investigates evidence, then questions each suspect out loud. Each suspect is played later by a separate AI agent that sees ONLY that suspect's own record (role, personality, knows, secret, lie). The player wins by catching suspects' lies against the evidence or each other's testimony, then proving the culprit.

DESIGN RULES
- 3 or 4 suspects with ids "s1".."s4". Exactly one culprit (truth.culpritId). All suspects are adults.
- EVERY suspect hides a secret and tells a lie. The culprit's lie is their alibi or cover story about the crime. Innocent suspects lie about something embarrassing or self-protective that looks suspicious but is NOT the crime (red herrings). Each innocent's lie must also be exposable by evidence, and exposing it should clear them.
- "knows": 6 to 9 short facts, FIRST PERSON ("I saw...", "I was..."), covering that suspect's real whereabouts on the timeline, what they saw/heard, relationships, and useful observations about others. Include at least one observation that, if the player asks about it, helps expose ANOTHER suspect. The culprit's "knows" must include the true account of what they did (they know they did it).
- "secret": first person, what they are hiding and why. For the culprit this is the crime itself.
- "lie": first person, the exact cover story they will tell, with concrete checkable details (times, places, claims) so it can be contradicted.
- 5 to 8 evidence items with ids "e1".."e8". 3 to 5 have foundIn "scene": physical objects visible in the crime-scene image, each with sceneRegionHint = a 1 to 3 word concrete noun phrase naming the object exactly as it would be segmented (e.g. "brass key tag", "teacup", "umbrella"). Pick distinct, medium-sized, visually obvious objects; never tiny marks, stains, text or fingerprints. Others have foundIn "file" (documents, logs, witness statements, receipts) with sceneRegionHint "".
- imagePrompt: for scene objects, a close-up photo description of the object; for file items, "" unless a picture adds information without readable text.
- relatesTo: suspect ids and/or short timeline references.
- solution.requiredEvidenceIds: 2 or 3 evidence ids that together prove the culprit beyond doubt.
- solution.keyContradictions: 3 to 5 items, ids "c1".."c5". Each pairs a specific claim from a suspect's lie ("statement", quoted or paraphrased as the suspect will say it) with the evidence or testimony it conflicts with ("conflictsWith"), lists the exposing evidenceIds (at least one), and explains in one sentence why both cannot be true. At least 2 must expose the culprit. Include at least one per innocent suspect.
- breaksOn: for each suspect, the evidence ids AND contradiction ids that make that suspect crack.
- truth.timeline: 6 to 10 entries in time order with witnessIds (suspect ids who saw it, can be empty).
- scenePrompt: a vivid description of the crime scene for an image model. It MUST explicitly describe every foundIn "scene" object as clearly visible, using the same words as its sceneRegionHint. No people in the scene. No readable text.
- portraitPrompt: head-and-shoulders appearance of that suspect (age, look, clothing, expression). No names, no text.
- voiceHint matches the character; voicePitch between 0.6 and 1.4 and voiceRate between 0.85 and 1.15, different for each suspect so they sound distinct.
- victimOrIncident is the PUBLIC account: what happened, where, and the time window. It must not reveal the culprit.
- title: short and evocative. setting: place and time.

CONTENT RULES
- Crimes are non-graphic: theft, sabotage, forgery, fraud, a disappearance that turns out fine, a poisoned prize-winning cake, and so on. No gore, no sexual content, no harm to children, no real people or brands, no politics, no medical or mental-health themes, no slurs.
- Vary settings and eras. Avoid cliches like "the butler did it". Use original names.

QUALITY BAR
- A careful player with ONLY the evidence plus what suspects say under questioning can logically prove the culprit. Nothing depends on luck or hidden knowledge.
- Lies must be specific enough to be contradicted. Evidence must be concrete.
- Keep every string concise: descriptions 1 to 2 sentences.`;

// Used when the player gives no theme, so cases don't converge on one favourite setting.
const SETTING_IDEAS = [
  "a 1920s jazz club on opening night",
  "a mountain observatory during a blizzard",
  "a family-run vineyard at harvest",
  "a regional baking competition final",
  "a night train crossing the desert",
  "a small-town radio station during a live broadcast",
  "a botanical greenhouse before a rare flower show",
  "a chess tournament in a grand hotel",
  "a lighthouse keepers' reunion on a remote island",
  "a 1960s film set on the last day of shooting",
  "a ski lodge snowed in overnight",
  "a university robotics lab before a competition",
  "a riverboat casino in the 1890s",
  "a perfume house launching a new scent",
  "a coastal fish market at dawn",
  "a violin workshop in an old European town",
  "a dog show backstage area",
  "a space-agency mission control during a test launch",
  "a Victorian theatre on premiere night",
  "a rooftop restaurant during a city festival",
  "a tea plantation in the hills during monsoon",
  "an antique bookshop during an auction",
];

export function caseUserPrompt(theme?: string) {
  const seed = Math.random().toString(36).slice(2, 8);
  const idea = theme?.trim()
    ? `Theme or setting idea from the player: "${theme.trim().slice(0, 200)}".`
    : `Setting idea: ${SETTING_IDEAS[Math.floor(Math.random() * SETTING_IDEAS.length)]} (adapt freely; do not use a museum).`;
  return `Write a brand-new case now. ${idea} Variation seed: ${seed}. Return only the JSON.`;
}

export function repairUserPrompt(previous: unknown, issues: string[]) {
  return `The case below failed the solvability review. Fix every issue while keeping the same cast and setting where possible, and return the COMPLETE corrected case as JSON.

ISSUES:
${issues.map((i, k) => `${k + 1}. ${i}`).join("\n")}

CASE:
${JSON.stringify(previous)}`;
}

export const SOLVABILITY_SCHEMA = obj({
  solvable: { type: "boolean" },
  score: { type: "integer" },
  culpritProvable: { type: "boolean" },
  issues: strArr,
});

export type SolvabilityResult = { solvable: boolean; score: number; culpritProvable: boolean; issues: string[] };

export const SOLVABILITY_INSTRUCTIONS = `You are a strict puzzle editor validating a detective case for a cross-examination game. You receive the full case file as JSON, including the hidden truth.
Answer in JSON:
- culpritProvable: can the culprit be proven using ONLY the listed evidence plus contradictions in suspects' lies (the player cannot see the truth or anyone's secret)?
- solvable: true only if culpritProvable AND all of these hold: every key contradiction is a genuine logical conflict between the suspect's lie and the cited evidence; the requiredEvidenceIds really point to the culprit and not equally to an innocent; no innocent suspect is equally provable; each scene evidence item's sceneRegionHint names a concrete object that the scenePrompt explicitly includes; ids referenced in breaksOn, relatesTo, evidenceIds and requiredEvidenceIds exist.
- score: 0 to 10 for overall fairness and quality.
- issues: specific, actionable problems to fix (empty if none). Do not nitpick style.`;
