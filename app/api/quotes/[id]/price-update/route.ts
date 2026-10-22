import type { PriceUpdateResponse } from "@/lib/contract";
import { priceUpdate } from "@/lib/ai/priceUpdate";
import { logAiCall } from "@/lib/server/ai-calls";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { errorResponse } from "@/lib/server/http";
import { priceUpdateTerms } from "@/lib/server/price-rules";
import { readQuote } from "@/lib/server/quotes";

// Drafts the price-update message for an underwater quote: the old price, the
// same formula at latest costs, and valid-until reset to the shop's default.
// Saves nothing; copying the message calls the apply route. Answers
// invalid_request unless the quote is open and underwater.
export async function POST(_request: Request, ctx: RouteContext<"/api/quotes/[id]/price-update">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const detail = await readQuote(supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");

  const stemIds = detail.lines.flatMap((line) => (line.stemId === null ? [] : [line.stemId]));
  const costs = new Map((await stemsWithCost(supabase, stemIds)).map((stem) => [stem.id, stem.latestCost]));
  const terms = priceUpdateTerms(detail.quote, detail.lines, costs, shop, new Date());
  if (!terms.ok) return errorResponse("invalid_request", "Only an open, underwater quote gets a price update");

  const outcome = await priceUpdate(terms);
  await logAiCall(supabase, shop.id, {
    call: "priceUpdate",
    model: outcome.model,
    seconds: outcome.seconds,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    quoteId: detail.quote.id,
    receiptId: null,
    ok: outcome.ok,
    error: outcome.ok ? "" : outcome.error,
  });
  // TODO(#30): answer errorResponse("ai_failed", ...) (502) once PR #30 adds the code; until then this is a 500.
  if (!outcome.ok) throw new Error(`priceUpdate failed: ${outcome.error}`);

  const { oldPrice, newPrice, validUntil } = terms;
  return Response.json({ message: outcome.result.message, oldPrice, newPrice, validUntil, demo: false } satisfies PriceUpdateResponse);
}
