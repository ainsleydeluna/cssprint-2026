import type { DeleteQuoteResponse, QuoteResponse, UpdateQuoteRequest, UpdateQuoteResponse } from "@/lib/contract";
import { findQuote } from "@/lib/fake/responses";
import { withRealStemIds } from "@/lib/fake/real-stems";
import { errorResponse } from "@/lib/server/http";

// Stubs: answer fake data until a backend ticket replaces them.
// Fake stem ids are swapped for the shop's real stems (lib/fake/real-stems.ts).
export async function GET(_request: Request, ctx: RouteContext<"/api/quotes/[id]">) {
  const detail = findQuote((await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  return withRealStemIds(detail satisfies QuoteResponse);
}

// Rename, and edit the budget, valid-until date or reply text.
export async function PATCH(request: Request, ctx: RouteContext<"/api/quotes/[id]">) {
  const detail = findQuote((await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  const changes: UpdateQuoteRequest = await request.json();
  return Response.json({ ...detail.quote, ...changes } satisfies UpdateQuoteResponse);
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/quotes/[id]">) {
  if (!findQuote((await ctx.params).id)) return errorResponse("not_found", "Quote not found");
  return Response.json({ deleted: true } satisfies DeleteQuoteResponse);
}
