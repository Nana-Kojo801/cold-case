"use client";
// Browser storage: IndexedDB for case files, sessions and images; localStorage for small settings/progress.
import { createStore, del, get, keys, set } from "idb-keyval";
import type { CaseFile, ProgressSummary, Session } from "@/lib/types";

const isBrowser = typeof window !== "undefined";
const stores = isBrowser
  ? {
      cases: createStore("cold-case-cases", "cases"),
      sessions: createStore("cold-case-sessions", "sessions"),
      images: createStore("cold-case-images", "images"),
    }
  : null;

export const DEMO_CASE_ID = "demo-saltmere-compass";

export async function saveCase(c: CaseFile) {
  if (stores) await set(c.id, c, stores.cases);
}

export async function loadCase(id: string): Promise<CaseFile | undefined> {
  if (!stores) return undefined;
  const c = await get<CaseFile>(id, stores.cases);
  if (c) return c;
  if (id === DEMO_CASE_ID) return loadDemoCase();
  return undefined;
}

export async function listCases(): Promise<CaseFile[]> {
  if (!stores) return [];
  const ids = (await keys(stores.cases)) as string[];
  const all = await Promise.all(ids.map((id) => get<CaseFile>(id, stores.cases)));
  return all.filter((c): c is CaseFile => Boolean(c)).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export async function deleteCase(id: string) {
  if (!stores) return;
  await del(id, stores.cases);
  await del(id, stores.sessions);
}

/** The bundled demo case ships as static JSON in /public/demo-case/ so it never needs a live generation. */
export async function loadDemoCase(): Promise<CaseFile> {
  const res = await fetch("/demo-case/case.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("Demo case missing");
  const c = (await res.json()) as CaseFile;
  await saveCase(c);
  return c;
}

export async function saveSession(s: Session) {
  if (stores) await set(s.caseId, s, stores.sessions);
}

export async function loadSession(caseId: string): Promise<Session | undefined> {
  if (!stores) return undefined;
  return get<Session>(caseId, stores.sessions);
}

export async function resetSession(caseId: string) {
  if (stores) await del(caseId, stores.sessions);
}

// ---------- Images ----------

export async function saveImage(key: string, blob: Blob) {
  if (stores) await set(key, blob, stores.images);
}

export async function loadImageBlob(key: string): Promise<Blob | undefined> {
  if (!stores) return undefined;
  if (key.startsWith("/")) {
    const res = await fetch(key);
    if (!res.ok) return undefined;
    return res.blob();
  }
  return get<Blob>(key, stores.images);
}

export function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Downscale an image blob to a JPEG data URL (for SAM input and Muse Image reference images). */
export async function blobToScaledDataUrl(blob: Blob, maxSide = 1024, quality = 0.85): Promise<{ dataUrl: string; width: number; height: number }> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
}

// ---------- Progress & settings (localStorage) ----------

const PROGRESS_KEY = "cold-case:progress";
const SETTINGS_KEY = "cold-case:settings";

export function loadProgress(): ProgressSummary[] {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addProgress(p: ProgressSummary) {
  try {
    const all = loadProgress().filter((x) => x.caseId !== p.caseId);
    all.push(p);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all.slice(-100)));
  } catch {
    // storage unavailable: progress just isn't kept
  }
}

export type Settings = { voice: boolean };

export function loadSettings(): Settings {
  try {
    return { voice: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { voice: true };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
