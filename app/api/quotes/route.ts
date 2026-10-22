import type { CreateQuoteResponse, QuoteListResponse } from "@/lib/contract";
import { createQuote, quoteList } from "@/lib/fake/responses";
import { withRealStemIds } from "@/lib/fake/real-stems";

// Stubs: answer fake data until a backend ticket replaces them.
// Fake stem ids are swapped for the shop's real stems (lib/fake/real-stems.ts).
export async function GET() {
  return Response.json(quoteList satisfies QuoteListResponse);
}

export async function POST() {
  return withRealStemIds(createQuote satisfies CreateQuoteResponse);
}
