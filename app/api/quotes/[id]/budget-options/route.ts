import type { BudgetOptionsResponse } from "@/lib/contract";
import { budgetOptions, findQuote } from "@/lib/fake/responses";
import { withRealStemIds } from "@/lib/fake/real-stems";
import { errorResponse } from "@/lib/server/http";

// Stub: answers fake data until a backend ticket replaces it.
// Fake stem ids are swapped for the shop's real stems (lib/fake/real-stems.ts).
export async function POST(_request: Request, ctx: RouteContext<"/api/quotes/[id]/budget-options">) {
  if (!findQuote((await ctx.params).id)) return errorResponse("not_found", "Quote not found");
  return withRealStemIds(budgetOptions satisfies BudgetOptionsResponse);
}
