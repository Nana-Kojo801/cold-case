// Simple in-memory rate limiter: per IP per minute, per IP per day, and a global daily cap per bucket.
// On serverless this is per instance (best effort). For a hard guarantee, back it with a shared store.

type Bucket = "case" | "check" | "image" | "segment" | "transcribe" | "suspect" | "analyze" | "debrief";

const n = (v: string | undefined, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : d;
};

const PER_MINUTE = n(process.env.RL_PER_MINUTE, 40); // all buckets, per IP

// Per-IP daily allowance and global daily cap, per bucket.
const LIMITS: Record<Bucket, { ipDay: number; globalDay: number }> = {
  case: { ipDay: n(process.env.RL_CASE_IP_DAY, 8), globalDay: n(process.env.RL_CASE_GLOBAL_DAY, 200) },
  check: { ipDay: 30, globalDay: 800 },
  image: { ipDay: n(process.env.RL_IMAGE_IP_DAY, 90), globalDay: n(process.env.RL_IMAGE_GLOBAL_DAY, 2000) },
  segment: { ipDay: 300, globalDay: 6000 },
  transcribe: { ipDay: 400, globalDay: 10000 },
  suspect: { ipDay: n(process.env.RL_TURN_IP_DAY, 400), globalDay: n(process.env.RL_TURN_GLOBAL_DAY, 10000) },
  analyze: { ipDay: n(process.env.RL_TURN_IP_DAY, 400), globalDay: n(process.env.RL_TURN_GLOBAL_DAY, 10000) },
  debrief: { ipDay: 40, globalDay: 1000 },
};

type Counter = { count: number; resetAt: number };
const store = new Map<string, Counter>();

function hit(key: string, windowMs: number, limit: number, cost: number, now: number): boolean {
  let c = store.get(key);
  if (!c || c.resetAt <= now) {
    c = { count: 0, resetAt: now + windowMs };
    store.set(key, c);
  }
  if (c.count + cost > limit) return false;
  c.count += cost;
  return true;
}

function sweep(now: number) {
  if (store.size < 5000) return;
  for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
}

/** Returns a 429 Response if the request is over a limit, or null if it may proceed. */
export function rateLimit(req: Request, bucket: Bucket, cost = 1): Response | null {
  const now = Date.now();
  sweep(now);
  const ip = clientIp(req);
  const day = 24 * 60 * 60 * 1000;
  const lim = LIMITS[bucket];
  const ok =
    hit(`m:${ip}`, 60_000, PER_MINUTE, cost, now) &&
    hit(`d:${bucket}:${ip}`, day, lim.ipDay, cost, now) &&
    hit(`g:${bucket}`, day, lim.globalDay, cost, now);
  if (ok) return null;
  return Response.json(
    {
      error: "The detective agency is out of coffee for now. You've hit the demo's usage limit. Come back a bit later, or play the demo case.",
      code: "rate_limited",
      retryable: false,
    },
    { status: 429 },
  );
}
