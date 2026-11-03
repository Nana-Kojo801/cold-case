// Meta Model API access. Server only: never import this from a client component.
// All model IDs were confirmed against https://dev.meta.ai/docs/models and can be overridden by env vars.
import OpenAI from "openai";

export const META_BASE_URL = process.env.META_BASE_URL || "https://api.meta.ai/v1";

export const MODELS = {
  wonder: process.env.MODEL_WONDER || "muse-wonder-1.0",
  spark: process.env.MODEL_SPARK || "muse-spark-1.1",
  image: process.env.MODEL_IMAGE || "muse-image-1.0",
  sam: process.env.MODEL_SAM || "sam-3.1",
  asr: process.env.MODEL_ASR || "muse-voice-transcribe-1.0",
};

/** Which model plays the suspects. Wonder by default; set SUSPECT_MODEL=spark if Wonder is too slow live. */
export function suspectModel() {
  return (process.env.SUSPECT_MODEL || "wonder").toLowerCase() === "spark" ? MODELS.spark : MODELS.wonder;
}

type Effort = "minimal" | "low" | "medium" | "high";
export const EFFORT = {
  caseGen: (process.env.EFFORT_CASE as Effort) || "medium",
  suspect: (process.env.EFFORT_SUSPECT as Effort) || "low",
  analysis: (process.env.EFFORT_ANALYSIS as Effort) || "low",
  debrief: (process.env.EFFORT_DEBRIEF as Effort) || "low",
};

export function apiKey(): string | undefined {
  return process.env.MODEL_API_KEY || process.env.META_API_KEY || undefined;
}

export function isConfigured() {
  return Boolean(apiKey());
}

let _client: OpenAI | null = null;
export function client(): OpenAI {
  const key = apiKey();
  if (!key) throw new MetaUnavailableError("The Meta Model API key is not configured on the server.");
  if (!_client) {
    // maxRetries: 1 => the SDK retries once on 408/409/429/5xx/connection errors (spec section 11).
    _client = new OpenAI({ baseURL: META_BASE_URL, apiKey: key, maxRetries: 1, timeout: 120_000 });
  }
  return _client;
}

export class MetaUnavailableError extends Error {}

/** Pull the first JSON object out of a model reply, tolerating code fences or stray prose. */
export function parseJsonLoose<T = unknown>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]) as T;
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  }
  throw new Error("Model reply did not contain JSON");
}

type InputMessage = { role: "user" | "assistant" | "developer" | "system"; content: string };

/**
 * A structured JSON call on the Responses API (text.format = json_schema), parsed defensively.
 */
export async function jsonCall<T>(opts: {
  model: string;
  instructions: string;
  input: string | InputMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: Effort;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const res = await client().responses.create(
    {
      model: opts.model,
      instructions: opts.instructions,
      input: opts.input as never,
      reasoning: opts.effort ? { effort: opts.effort } : undefined,
      store: false,
      text: {
        format: { type: "json_schema", name: opts.schemaName, schema: opts.schema, strict: true },
      },
    },
    { timeout: opts.timeoutMs ?? 90_000, signal: opts.signal },
  );
  const text = res.output_text ?? "";
  if (!text) throw new Error("Empty reply from model");
  return parseJsonLoose<T>(text);
}

/** A plain text call on the Responses API. */
export async function textCall(opts: {
  model: string;
  instructions: string;
  input: string | InputMessage[];
  effort?: Effort;
  timeoutMs?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await client().responses.create(
    {
      model: opts.model,
      instructions: opts.instructions,
      input: opts.input as never,
      reasoning: opts.effort ? { effort: opts.effort } : undefined,
      store: false,
      max_output_tokens: opts.maxOutputTokens,
    },
    { timeout: opts.timeoutMs ?? 60_000, signal: opts.signal },
  );
  return (res.output_text ?? "").trim();
}

/** Map any thrown error to a friendly, client-safe message. Never includes the API key. */
export function describeError(err: unknown): { status: number; error: string; code: string; retryable: boolean } {
  if (err instanceof MetaUnavailableError) {
    return { status: 503, error: "The AI service isn't configured right now. The demo case still works.", code: "not_configured", retryable: false };
  }
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 502;
    if (status === 401 || status === 403) {
      return { status: 503, error: "The AI service rejected our credentials. Try the demo case.", code: "auth", retryable: false };
    }
    if (status === 429) {
      return { status: 503, error: "The AI service is busy right now. Give it a moment and retry.", code: "upstream_busy", retryable: true };
    }
    if (status >= 500) {
      return { status: 502, error: "The AI service had a hiccup. Please retry.", code: "upstream_error", retryable: true };
    }
    return { status: 502, error: "The AI service couldn't handle that request.", code: "upstream_rejected", retryable: true };
  }
  if (err instanceof OpenAI.APIConnectionTimeoutError || (err instanceof Error && /timeout|timed out/i.test(err.message))) {
    return { status: 504, error: "The AI took too long to answer. Please retry.", code: "timeout", retryable: true };
  }
  if (err instanceof Error && err.name === "AbortError") {
    return { status: 499, error: "Cancelled.", code: "cancelled", retryable: true };
  }
  return { status: 500, error: "Something went wrong on our side. Please retry.", code: "internal", retryable: true };
}

export function errorResponse(err: unknown) {
  const d = describeError(err);
  // Log a safe summary only (never the key or full request bodies).
  console.error(`[cold-case] ${d.code}:`, err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300));
  return Response.json({ error: d.error, code: d.code, retryable: d.retryable }, { status: d.status });
}
