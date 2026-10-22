import type { ApplyPriceUpdateResponse } from "@/lib/contract";
import { findQuote, priceUpdate } from "@/lib/fake/responses";
import { errorResponse } from "@/lib/server/http";

// Stub: answers fake data until a backend ticket replaces it.
// Sets the new price, resets valid-until, clears the flag, leaves sentAt alone.
export async function POST(_request: Request, ctx: RouteContext<"/api/quotes/[id]/price-update/apply">) {
  const detail = findQuote((await ctx.params).id);
  if (!detail) return errorResponse(404, "Quote not found");
  return Response.json({
    ...detail.quote,
    price: priceUpdate.newPrice,
    validUntil: priceUpdate.validUntil,
    underwaterAt: null,
  } satisfies ApplyPriceUpdateResponse);
}
