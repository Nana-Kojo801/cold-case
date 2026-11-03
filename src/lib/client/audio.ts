"use client";
// Microphone capture with MediaRecorder, converted in the browser to mono 16-bit PCM WAV at 16 kHz,
// which is the format Muse Voice Transcribe's file endpoint accepts.

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  startedAt = 0;

  static supported() {
    return typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported?.(m));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
    this.startedAt = Date.now();
  }

  async stop(): Promise<Blob> {
    const rec = this.rec;
    if (!rec) throw new Error("Not recording");
    const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
    if (rec.state !== "inactive") rec.stop();
    await done;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.rec = null;
    return new Blob(this.chunks, { type: rec.mimeType || "audio/webm" });
  }

  cancel() {
    try {
      if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    } catch {
      // ignore
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.rec = null;
  }
}

const TARGET_RATE = 16000;

export async function toWav16k(blob: Blob): Promise<Blob> {
  const buf = await blob.arrayBuffer();
  const Ctx: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf);
  } finally {
    ctx.close?.();
  }
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded; // multi-channel input is mixed down to the mono destination
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
