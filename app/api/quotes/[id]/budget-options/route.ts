import type { BudgetOptionsResponse } from "@/lib/contract";
import { budgetOptions, findQuote } from "@/lib/fake/responses";
import { errorResponse } from "@/lib/server/http";

// Stub: answers fake data until a backend ticket replaces it.
export async function POST(_request: Request, ctx: RouteContext<"/api/quotes/[id]/budget-options">) {
  if (!findQuote((await ctx.params).id)) return errorResponse(404, "Quote not found");
  return Response.json(budgetOptions satisfies BudgetOptionsResponse);
}
