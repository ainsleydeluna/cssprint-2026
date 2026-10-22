import type { CreateQuoteResponse, QuoteListResponse } from "@/lib/contract";
import { createQuote, quoteList } from "@/lib/fake/responses";

// Stubs: answer fake data until a backend ticket replaces them.
export async function GET() {
  return Response.json(quoteList satisfies QuoteListResponse);
}

export async function POST() {
  return Response.json(createQuote satisfies CreateQuoteResponse);
}
