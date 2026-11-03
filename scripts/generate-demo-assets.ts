// Pre-generate the bundled demo case's images with Muse Image and locate its scene clues with SAM 3.1,
// so the demo never depends on a live call. Writes into public/demo-case/.
// Run: npm run demo:assets            (skips images that already exist)
//      npm run demo:assets -- --force (regenerates everything)
import "./env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateImage } from "@/lib/server/images";
import { segment } from "@/lib/server/sam";
import type { CaseFile, SamObject } from "@/lib/types";
import { imageSize, mimeOf } from "./env";

const DIR = "public/demo-case";
const force = process.argv.includes("--force");
const casePath = join(DIR, "case.json");
const c = JSON.parse(readFileSync(casePath, "utf8")) as CaseFile;
const file = (key: string) => join("public", key.replace(/^\//, ""));

async function gen(key: string, kind: "scene" | "evidence" | "portrait", prompt: string, ref?: Buffer) {
  const path = file(key);
  if (existsSync(path) && !force) {
    console.log("skip", path);
    return readFileSync(path);
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const t = Date.now();
      const r = await generateImage({ kind, prompt, referenceDataUrl: ref ? `data:${mimeOf(ref)};base64,${ref.toString("base64")}` : undefined });
      const buf = Buffer.from(r.b64, "base64");
      writeFileSync(path, buf);
      console.log("wrote", path, imageSize(buf), `${((Date.now() - t) / 1000).toFixed(1)}s`);
      return buf;
    } catch (e) {
      console.log(`fail ${path} (attempt ${attempt}):`, (e as Error).message?.slice(0, 200));
    }
  }
  return undefined;
}

async function main() {
  const scene = await gen(c.scene.imageKey, "scene", c.scene.prompt);
  const jobs: Promise<unknown>[] = [];
  for (const e of c.evidence) if (e.imageKey && e.imagePrompt) jobs.push(gen(e.imageKey, "evidence", e.imagePrompt, e.sceneRegionHint ? scene : undefined));
  for (const s of c.suspects) jobs.push(gen(s.portrait.imageKey, "portrait", s.portrait.prompt));
  await Promise.all(jobs);

  if (!scene) {
    console.log("No scene image, so SAM locations were skipped.");
    return;
  }
  const { width, height } = imageSize(scene);
  const dataUrl = `data:${mimeOf(scene)};base64,${scene.toString("base64")}`;
  const locs: Record<string, SamObject | null> = {};
  for (const e of c.evidence.filter((x) => x.sceneRegionHint)) {
    try {
      const objs = await segment({ imageDataUrl: dataUrl, width, height, phrase: e.sceneRegionHint! });
      const area = (o: SamObject) => (o.box[2] - o.box[0]) * (o.box[3] - o.box[1]);
      locs[e.id] = objs.length ? objs.reduce((a, b) => (area(a) >= area(b) ? a : b)) : null;
      console.log(`SAM "${e.sceneRegionHint}":`, objs.length, "match(es)", locs[e.id]?.box ?? "");
    } catch (err) {
      console.log(`SAM "${e.sceneRegionHint}" failed:`, (err as Error).message?.slice(0, 200));
      locs[e.id] = null;
    }
  }
  c.sceneLocations = locs;
  writeFileSync(casePath, JSON.stringify(c, null, 2) + "\n");
  const missing = Object.entries(locs).filter(([, v]) => !v).map(([k]) => k);
  console.log("Updated", casePath, missing.length ? `(not found: ${missing.join(", ")}. Regenerate the scene with --force or tweak the hints)` : "");
}

main();
