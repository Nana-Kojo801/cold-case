"use client";
import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, readJson } from "@/lib/client/api";
import { Recorder, toWav16k } from "@/lib/client/audio";
import { cn } from "@/lib/utils";

/**
 * Hold to talk (or tap to start, tap again to stop). Records with MediaRecorder, converts to WAV,
 * transcribes with Muse Voice Transcribe via /api/transcribe, and hands the text back for review.
 */
export function MicButton({
  onTranscript,
  keywords,
  disabled,
  size = "lg",
}: {
  onTranscript: (text: string) => void;
  keywords?: string[];
  disabled?: boolean;
  size?: "lg" | "sm";
}) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const rec = useRef<Recorder | null>(null);
  const pressAt = useRef(0);
  const toggleMode = useRef(false);

  useEffect(() => () => rec.current?.cancel(), []);

  async function start() {
    if (!Recorder.supported()) {
      toast.error("Voice input isn't supported in this browser. Type your question instead.");
      return;
    }
    try {
      rec.current = new Recorder();
      await rec.current.start();
      setState("recording");
      navigator.vibrate?.(15);
    } catch {
      rec.current = null;
      setState("idle");
      toast.error("Microphone unavailable. Allow mic access, or type your question.");
    }
  }

  async function stop() {
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setState("working");
    try {
      const blob = await r.stop();
      if (Date.now() - r.startedAt < 400) {
        setState("idle");
        return;
      }
      let wav: Blob;
      try {
        wav = await toWav16k(blob);
      } catch {
        throw new ApiError("We couldn't process that recording. Type your question instead.", "audio", false);
      }
      const fd = new FormData();
      fd.append("audio", wav, "question.wav");
      if (keywords?.length) fd.append("keywords", JSON.stringify(keywords));
      let res: Response;
      try {
        res = await fetch("/api/transcribe", { method: "POST", body: fd });
      } catch {
        throw new ApiError("Can't reach the server. Type your question instead.", "network");
      }
      const data = await readJson<{ text: string }>(res);
      if (!data.text) toast.message("We didn't catch that. Try again, or type it.");
      else onTranscript(data.text);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Voice input failed. Type your question instead.");
    } finally {
      setState("idle");
    }
  }

  const onDown = (e: React.PointerEvent) => {
    if (disabled || state === "working") return;
    e.preventDefault();
    if (state === "recording") {
      // second tap in toggle mode
      toggleMode.current = false;
      stop();
      return;
    }
    pressAt.current = Date.now();
    toggleMode.current = false;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    start();
  };

  const onUp = () => {
    if (state !== "recording" && !rec.current) return;
    if (Date.now() - pressAt.current < 350) {
      // quick tap: stay recording until the next tap
      toggleMode.current = true;
      return;
    }
    if (!toggleMode.current) stop();
  };

  const big = size === "lg";
  return (
    <button
      type="button"
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled || state === "working"}
      aria-label={state === "recording" ? "Recording. Release or tap to send." : "Hold to ask a question out loud"}
      className={cn(
        "relative flex shrink-0 touch-none select-none items-center justify-center rounded-full border-2 transition-all disabled:opacity-50",
        big ? "size-20" : "size-12",
        state === "recording"
          ? "scale-110 border-destructive bg-destructive text-white shadow-[0_0_0_10px_color-mix(in_oklch,var(--destructive),transparent_75%)]"
          : "border-primary bg-primary text-primary-foreground shadow-lg",
      )}
    >
      {state === "working" ? <Loader2 className={cn("animate-spin", big ? "size-8" : "size-5")} /> : state === "recording" ? <Square className={big ? "size-7" : "size-4"} /> : <Mic className={big ? "size-9" : "size-5"} />}
      {state === "recording" ? <span className="absolute inset-0 animate-ping rounded-full border-2 border-destructive/60" /> : null}
    </button>
  );
}
