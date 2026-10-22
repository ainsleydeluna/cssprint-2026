import type { ReceiptListResponse, SaveReceiptResponse } from "@/lib/contract";
import { receiptList, saveReceipt } from "@/lib/fake/responses";

// Stubs: answer fake data until a backend ticket replaces them.
export async function GET() {
  return Response.json(receiptList satisfies ReceiptListResponse);
}

export async function POST() {
  return Response.json(saveReceipt satisfies SaveReceiptResponse);
}
