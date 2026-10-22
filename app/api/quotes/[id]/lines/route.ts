import type { UpdateQuoteLinesRequest, UpdateQuoteLinesResponse } from "@/lib/contract";
import { findQuote, repriceQuote } from "@/lib/fake/responses";
import { errorResponse } from "@/lib/server/http";

// Stub: answers fake data until a backend ticket replaces it.
export async function PUT(request: Request, ctx: RouteContext<"/api/quotes/[id]/lines">) {
  const detail = findQuote((await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  const body: UpdateQuoteLinesRequest = await request.json();
  return Response.json(repriceQuote(detail, body) satisfies UpdateQuoteLinesResponse);
}
