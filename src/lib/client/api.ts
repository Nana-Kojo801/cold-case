"use client";
// Typed fetch helpers for the server routes. Every call can fail: callers get an ApiError with a friendly message.

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string = "error",
    public retryable = true,
    public status = 0,
  ) {
    super(message);
  }
}

/**
 * POST JSON with a hard client-side timeout, so a dropped connection (phone asleep, network
 * switch) becomes a retryable error instead of a request that waits forever.
 */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal, timeoutMs = 120_000): Promise<T> {
  const timer = new AbortController();
  const t = setTimeout(() => timer.abort(), timeoutMs);
  const onCancel = () => timer.abort();
  if (signal?.aborted) timer.abort();
  signal?.addEventListener("abort", onCancel);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: timer.signal,
    });
    return await readJson<T>(res);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error).name === "AbortError") {
      if (signal?.aborted) throw new ApiError("Cancelled.", "cancelled", false);
      throw new ApiError("That took much longer than usual. The connection may have dropped. Please retry.", "timeout", true);
    }
    throw new ApiError("Can't reach the server. Check your connection and retry.", "network", true);
  } finally {
    clearTimeout(t);
    signal?.removeEventListener("abort", onCancel);
  }
}

export async function readJson<T>(res: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string; retryable?: boolean };
    throw new ApiError(d.error || `Request failed (${res.status}).`, d.code || `http_${res.status}`, d.retryable ?? res.status >= 500, res.status);
  }
  return data as T;
}

let healthCache: Promise<{ ai: boolean; models?: Record<string, string> }> | null = null;
export function getHealth() {
  if (!healthCache) {
    healthCache = fetch("/api/health")
      .then((r) => r.json())
      .catch(() => ({ ai: false }));
  }
  return healthCache;
}
