"use client";
import type { CaseFile, SamObject } from "@/lib/types";
import { postJson } from "./api";
import { blobToScaledDataUrl, loadImageBlob } from "./db";

export function unpackBits(b64: string, n: number): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  return out;
}

/** Is image point (x, y), given in the object's own image pixel space, on the object? */
export function hitTest(o: SamObject, x: number, y: number): boolean {
  const [l, t, r, b] = o.box;
  if (x < l || x >= r || y < t || y >= b) return false;
  if (!o.mask) return true;
  const mx = Math.floor(((x - l) * o.mask.width) / Math.max(1, r - l));
  const my = Math.floor(((y - t) * o.mask.height) / Math.max(1, b - t));
  let raster = rasterCache.get(o);
  if (!raster) {
    raster = unpackBits(o.mask.bits, o.mask.width * o.mask.height);
    rasterCache.set(o, raster);
  }
  return raster[my * o.mask.width + mx] === 1;
}

const rasterCache = new WeakMap<SamObject, Uint8Array>();

export function boxIoU(a: SamObject, b: SamObject): number {
  const n = (o: SamObject) => [o.box[0] / o.imageWidth, o.box[1] / o.imageHeight, o.box[2] / o.imageWidth, o.box[3] / o.imageHeight];
  const [al, at, ar, ab] = n(a);
  const [bl, bt, br, bb] = n(b);
  const iw = Math.max(0, Math.min(ar, br) - Math.max(al, bl));
  const ih = Math.max(0, Math.min(ab, bb) - Math.max(at, bt));
  const inter = iw * ih;
  const uni = (ar - al) * (ab - at) + (br - bl) * (bb - bt) - inter;
  return uni > 0 ? inter / uni : 0;
}

const maskCanvasCache = new WeakMap<SamObject, HTMLCanvasElement>();

function maskCanvas(o: SamObject, rgb: [number, number, number]): HTMLCanvasElement | null {
  if (!o.mask) return null;
  const cached = maskCanvasCache.get(o);
  if (cached) return cached;
  const { width, height, bits } = o.mask;
  const raster = unpackBits(bits, width * height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < raster.length; i++) {
    if (!raster[i]) continue;
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = 130;
  }
  ctx.putImageData(img, 0, 0);
  maskCanvasCache.set(o, c);
  return c;
}

export function drawObjects(canvas: HTMLCanvasElement, objects: SamObject[], tone: "found" | "dim") {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const rgb: [number, number, number] = tone === "found" ? [245, 180, 60] : [200, 200, 210];
  for (const o of objects) {
    const sx = w / o.imageWidth;
    const sy = h / o.imageHeight;
    const [l, t, r, b] = o.box;
    const mc = maskCanvas(o, rgb);
    if (mc) ctx.drawImage(mc, l * sx, t * sy, (r - l) * sx, (b - t) * sy);
    ctx.strokeStyle = `rgba(${rgb.join(",")},0.95)`;
    ctx.lineWidth = 2;
    ctx.setLineDash(tone === "found" ? [] : [5, 4]);
    ctx.strokeRect(l * sx, t * sy, (r - l) * sx, (b - t) * sy);
  }
}

const sceneDataCache = new Map<string, Promise<{ dataUrl: string; width: number; height: number } | null>>();

export function sceneDataUrl(imageKey: string) {
  if (!sceneDataCache.has(imageKey)) {
    sceneDataCache.set(
      imageKey,
      loadImageBlob(imageKey)
        .then((b) => (b ? blobToScaledDataUrl(b, 1024) : null))
        .catch(() => null),
    );
  }
  return sceneDataCache.get(imageKey)!;
}

type SegmentResponse = { results: { phrase?: string; objects: SamObject[] | null }[] };

export async function segmentPhrases(imageKey: string, phrases: string[], signal?: AbortSignal) {
  const img = await sceneDataUrl(imageKey);
  if (!img) throw new Error("Scene image unavailable");
  const r = await postJson<SegmentResponse>("/api/segment", { image: img.dataUrl, width: img.width, height: img.height, phrases }, signal);
  return r.results;
}

export async function segmentPoint(imageKey: string, fx: number, fy: number, signal?: AbortSignal) {
  const img = await sceneDataUrl(imageKey);
  if (!img) throw new Error("Scene image unavailable");
  const r = await postJson<SegmentResponse>(
    "/api/segment",
    { image: img.dataUrl, width: img.width, height: img.height, point: { x: fx * img.width, y: fy * img.height } },
    signal,
  );
  return r.results[0]?.objects ?? [];
}

/** Locate every scene evidence item once with SAM 3.1 (concept prompts from sceneRegionHint). */
export async function locateEvidence(c: CaseFile, signal?: AbortSignal): Promise<Record<string, SamObject | null>> {
  const items = c.evidence.filter((e) => e.sceneRegionHint);
  const results = await segmentPhrases(c.scene.imageKey, items.map((e) => e.sceneRegionHint!), signal);
  const out: Record<string, SamObject | null> = {};
  items.forEach((e, i) => {
    const objs = results[i]?.objects ?? [];
    // Keep the largest match: generated scenes usually contain one instance of each clue.
    out[e.id] = objs.length ? objs.reduce((a, b) => ((a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) >= (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]) ? a : b)) : null;
  });
  return out;
}
