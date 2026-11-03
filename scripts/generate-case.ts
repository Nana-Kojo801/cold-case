// Milestone 1: generate a case with Muse Wonder, validate it with Muse Spark, print it.
// Run: npm run gen:case -- [--theme "a 1920s jazz club"] [--out case.json]
import "./env";
import { writeFileSync } from "node:fs";
import {
  CASE_INSTRUCTIONS,
  CASE_SCHEMA,
  SOLVABILITY_INSTRUCTIONS,
  SOLVABILITY_SCHEMA,
  caseUserPrompt,
  repairUserPrompt,
  type RawCase,
  type SolvabilityResult,
} from "@/lib/server/case-prompts";
import { EFFORT, MODELS, jsonCall } from "@/lib/server/meta";
import { normalizeCase } from "@/lib/server/normalize";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const theme = arg("theme");
  let t = Date.now();
  let raw = await jsonCall<RawCase>({ model: MODELS.wonder, instructions: CASE_INSTRUCTIONS, input: caseUserPrompt(theme), schemaName: "CaseFile", schema: CASE_SCHEMA, effort: EFFORT.caseGen, timeoutMs: 300_000 });
  console.error(`Generated in ${((Date.now() - t) / 1000).toFixed(1)}s with ${MODELS.wonder}`);
  for (let attempt = 0; attempt <= 2; attempt++) {
    const { problems } = normalizeCase(raw, "cli");
    t = Date.now();
    const v = await jsonCall<SolvabilityResult>({ model: MODELS.spark, instructions: SOLVABILITY_INSTRUCTIONS, input: JSON.stringify(raw), schemaName: "SolvabilityVerdict", schema: SOLVABILITY_SCHEMA, effort: "medium" });
    console.error(`Check ${attempt + 1} (${((Date.now() - t) / 1000).toFixed(1)}s, ${MODELS.spark}): solvable=${v.solvable} provable=${v.culpritProvable} score=${v.score}`);
    const issues = [...problems, ...v.issues];
    issues.forEach((i) => console.error("  -", i));
    if (v.solvable && v.culpritProvable && problems.length === 0) break;
    if (attempt === 2) {
      console.error("Still not solvable after 2 repairs.");
      break;
    }
    t = Date.now();
    raw = await jsonCall<RawCase>({ model: MODELS.wonder, instructions: CASE_INSTRUCTIONS, input: repairUserPrompt(raw, issues), schemaName: "CaseFile", schema: CASE_SCHEMA, effort: EFFORT.caseGen, timeoutMs: 300_000 });
    console.error(`Repaired in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  }
  const { caseFile } = normalizeCase(raw);
  const json = JSON.stringify(caseFile, null, 2);
  const out = arg("out");
  if (out) {
    writeFileSync(out, json);
    console.error("Wrote", out);
  } else console.log(json);
}

main().catch((e) => {
  console.error("Failed:", e?.status ?? "", e?.message ?? e);
  process.exit(1);
});
