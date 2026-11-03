// POST /api/segment: SAM 3.1 finds objects in the scene image, from noun phrases or a tapped point.
// Body: { image: dataURL, width, height, phrases?: string[], point?: {x, y} } (coordinates in image pixels).
import { errorResponse } from "@/lib/server/meta";
import { rateLimit } from "@/lib/server/ratelimit";
import { segment } from "@/lib/server/sam";

export const maxDuration = 90;

export async function POST(req: Request) {
  let body: { image?: string; width?: number; height?: number; phrases?: string[]; point?: { x: number; y: number } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { image, width, height } = body;
  if (!image?.startsWith("data:image/") || image.length > 4_000_000 || !width || !height) {
    return Response.json({ error: "Missing or oversized image" }, { status: 400 });
  }
  const phrases = (body.phrases ?? []).map((p) => String(p).trim()).filter(Boolean).slice(0, 8);
  const limited = rateLimit(req, "segment", Math.max(1, phrases.length));
  if (limited) return limited;
  try {
    if (body.point) {
      const objects = await segment({ imageDataUrl: image, width, height, point: body.point, signal: req.signal });
      return Response.json({ results: [{ point: body.point, objects }] });
    }
    const settled = await Promise.allSettled(
      phrases.map((phrase) => segment({ imageDataUrl: image, width, height, phrase, signal: req.signal })),
    );
    if (settled.every((s) => s.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
    return Response.json({
      results: settled.map((s, i) => ({
        phrase: phrases[i],
        objects: s.status === "fulfilled" ? s.value : null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
