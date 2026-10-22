import type { ExtractReceiptResponse } from "@/lib/contract";
import { extractReceipt } from "@/lib/fake/responses";
import { withRealStemIds } from "@/lib/fake/real-stems";

// Stub: answers fake data until a backend ticket replaces it.
// Fake stem ids are swapped for the shop's real stems (lib/fake/real-stems.ts).
export async function POST() {
  return withRealStemIds(extractReceipt satisfies ExtractReceiptResponse);
}
