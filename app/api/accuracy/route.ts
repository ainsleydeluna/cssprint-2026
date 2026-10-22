import type { AccuracyResponse } from "@/lib/contract";
import { accuracy } from "@/lib/fake/responses";

// Stub: answers fake data until a backend ticket replaces it.
export async function GET() {
  return Response.json(accuracy satisfies AccuracyResponse);
}
