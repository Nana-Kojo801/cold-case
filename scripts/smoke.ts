// Milestone 0 smoke test: one real call per Meta model, confirming IDs and request shapes.
// Run: npm run smoke
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { MODELS, META_BASE_URL, apiKey, jsonCall, textCall } from "@/lib/server/meta";
import { generateImage } from "@/lib/server/images";
import { segment } from "@/lib/server/sam";
import { imageSize } from "./env";

const out = "smoke-output";
mkdirSync(out, { recursive: true });

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`PASS ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    return r;
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.log(`FAIL ${name} (${((Date.now() - t) / 1000).toFixed(1)}s): ${e.status ?? ""} ${e.message?.slice(0, 300)}`);
    return undefined;
  }
}

function silentWav(seconds = 1, rate = 16000) {
  const n = seconds * rate;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

async function main() {
  console.log("Models:", MODELS);

  await step(`Muse Spark text (${MODELS.spark})`, async () => {
    const t = await textCall({ model: MODELS.spark, instructions: "Reply in five words or fewer.", input: "Say hello to a detective.", effort: "low" });
    console.log("  ->", t);
  });

  await step(`Muse Wonder structured JSON (${MODELS.wonder})`, async () => {
    const r = await jsonCall<{ suspect: string; alibi: string }>({
      model: MODELS.wonder,
      instructions: "Invent a one-line suspect and alibi.",
      input: "Go.",
      schemaName: "Mini",
      schema: { type: "object", properties: { suspect: { type: "string" }, alibi: { type: "string" } }, required: ["suspect", "alibi"], additionalProperties: false },
      effort: "low",
    });
    console.log("  ->", r);
  });

  const img = await step(`Muse Image (${MODELS.image})`, async () => {
    const r = await generateImage({ kind: "evidence", prompt: "A brass key tag on a wooden floor." });
    const buf = Buffer.from(r.b64, "base64");
    writeFileSync(`${out}/image.jpg`, buf);
    console.log("  -> saved", `${out}/image.jpg`, imageSize(buf));
    return buf;
  });

  if (img) {
    await step(`SAM 3.1 concept prompt (${MODELS.sam})`, async () => {
      const { width, height } = imageSize(img);
      const objs = await segment({ imageDataUrl: `data:image/jpeg;base64,${img.toString("base64")}`, width, height, phrase: "key tag" });
      console.log("  ->", objs.length, "object(s)", objs.map((o) => ({ box: o.box, mask: o.mask ? `${o.mask.width}x${o.mask.height}` : null })));
    });
    await step("SAM 3.1 point prompt", async () => {
      const { width, height } = imageSize(img);
      const objs = await segment({ imageDataUrl: `data:image/jpeg;base64,${img.toString("base64")}`, width, height, point: { x: width / 2, y: height / 2 } });
      console.log("  ->", objs.length, "object(s)");
    });
  }

  await step(`Muse Voice Transcribe (${MODELS.asr})`, async () => {
    const fd = new FormData();
    fd.append("request", new Blob([JSON.stringify({ model: MODELS.asr, audioEncoding: "WAV", mode: "PUSH_TO_TALK" })], { type: "application/json" }));
    fd.append("audio", new Blob([silentWav()], { type: "audio/wav" }), "silence.wav");
    const res = await fetch(`${META_BASE_URL}/asr/transcribe`, { method: "POST", headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" }, body: fd });
    const body = await res.text();
    if (!res.ok) throw Object.assign(new Error(body), { status: res.status });
    console.log("  ->", body.slice(0, 200), "(silence: an empty transcript is expected)");
  });
}

main();
