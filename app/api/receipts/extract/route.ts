import type { ExtractReceiptResponse } from "@/lib/contract";
import { extractReceipt } from "@/lib/fake/responses";

// Stub: answers fake data until a backend ticket replaces it.
export async function POST() {
  return Response.json(extractReceipt satisfies ExtractReceiptResponse);
}
