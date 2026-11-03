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

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new ApiError("Cancelled.", "cancelled", false);
    throw new ApiError("Can't reach the server. Check your connection and retry.", "network", true);
  }
  return readJson<T>(res);
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
