import type { ReceiptListResponse, SaveReceiptResponse } from "@/lib/contract";
import { receiptList, saveReceipt } from "@/lib/fake/responses";
import { withRealStemIds } from "@/lib/fake/real-stems";

// Stubs: answer fake data until a backend ticket replaces them.
// Fake stem ids are swapped for the shop's real stems (lib/fake/real-stems.ts).
export async function GET() {
  return withRealStemIds(receiptList satisfies ReceiptListResponse);
}

export async function POST() {
  return withRealStemIds(saveReceipt satisfies SaveReceiptResponse);
}
