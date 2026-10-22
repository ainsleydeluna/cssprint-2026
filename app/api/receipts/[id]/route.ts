import type { DeleteReceiptResponse } from "@/lib/contract";

// Stub: answers fake data until a backend ticket replaces it.
export async function DELETE() {
  return Response.json({ deleted: true, underwaterQuoteIds: [] } satisfies DeleteReceiptResponse);
}
