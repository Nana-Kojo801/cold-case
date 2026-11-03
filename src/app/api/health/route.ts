// GET /api/health: tells the client whether the Meta Model API is configured (never exposes the key).
import { connection } from "next/server";
import { MODELS, isConfigured, suspectModel } from "@/lib/server/meta";

export async function GET() {
  await connection();
  return Response.json({
    ai: isConfigured(),
    models: { ...MODELS, suspect: suspectModel() },
  });
}
