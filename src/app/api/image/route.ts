// POST /api/image: Muse Image generates a scene, evidence photo or suspect portrait.
// Evidence photos can pass the scene image as a reference for visual consistency.
import { generateImage, type ImageKind } from "@/lib/server/images";
import { errorResponse } from "@/lib/server/meta";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 180;

const KINDS: ImageKind[] = ["scene", "evidence", "portrait"];

export async function POST(req: Request) {
  const limited = rateLimit(req, "image");
  if (limited) return limited;
  let body: { kind?: ImageKind; prompt?: string; reference?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.kind || !KINDS.includes(body.kind) || !body.prompt?.trim()) {
    return Response.json({ error: "Missing kind or prompt" }, { status: 400 });
  }
  const reference = body.reference?.startsWith("data:image/") && body.reference.length < 3_000_000 ? body.reference : undefined;
  try {
    const img = await generateImage({ kind: body.kind, prompt: body.prompt, referenceDataUrl: reference, signal: req.signal });
    return Response.json(img);
  } catch (err) {
    return errorResponse(err);
  }
}
