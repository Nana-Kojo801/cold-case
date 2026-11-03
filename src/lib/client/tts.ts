"use client";
import { duckAmbience } from "./sfx";
// Suspect voices with the browser's speechSynthesis: per-character pitch, rate and voice.

type VoiceParams = { pitch: number; rate: number; voiceHint?: string };

let voices: SpeechSynthesisVoice[] = [];

function refreshVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("en"));
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
}

const FEMALE = /female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|susan|zira|hazel|libby|sonia|aria|jenny|natasha|google uk english female|en-gb-x-gba|en-us-x-sfg|en-us-x-tpc/i;
const MALE = /male|man|daniel|alex|fred|tom|oliver|george|ryan|guy|david|mark|arthur|google uk english male|en-gb-x-rjs|en-us-x-iom|en-us-x-tpd/i;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickVoice(id: string, hint?: string): SpeechSynthesisVoice | undefined {
  if (!voices.length) refreshVoices();
  if (!voices.length) return undefined;
  let pool = voices;
  if (hint === "female") pool = voices.filter((v) => FEMALE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, "")));
  else if (hint === "male") pool = voices.filter((v) => MALE.test(v.name) && !/female/i.test(v.name));
  if (!pool.length) pool = voices;
  return pool[hash(id) % pool.length];
}

export function ttsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, id: string, params: VoiceParams, onEnd?: () => void) {
  if (!ttsSupported()) {
    onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(id, params.voiceHint);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  // Same-voice devices still differ by pitch and rate per character.
  u.pitch = Math.min(2, Math.max(0, params.pitch));
  u.rate = Math.min(1.5, Math.max(0.5, params.rate));
  const done = () => {
    duckAmbience(false);
    onEnd?.();
  };
  u.onend = done;
  u.onerror = done;
  duckAmbience(true);
  synth.speak(u);
}

export function stopSpeaking() {
  duckAmbience(false);
  if (ttsSupported()) window.speechSynthesis.cancel();
}
