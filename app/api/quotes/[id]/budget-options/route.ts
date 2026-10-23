import type { BudgetOptionsResponse } from "@/lib/contract";
import { fitToBudget } from "@/lib/ai/fitToBudget";
import { maxRecipeCost, price, recipeCost } from "@/lib/money";
import { logAiCall } from "@/lib/server/ai-calls";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { parseBudgetOptions } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { priceBudgetOptions } from "@/lib/server/price-rules";
import { cannotSend } from "@/lib/server/quote-rules";
import { readQuote } from "@/lib/server/quotes";

// Saves the budget on the quote, asks fitToBudget for up to 3 cheaper recipes,
// prices each at latest costs and keeps those within budget and minimum margin;
// when none fit, only the cheapest, with overBudgetBy set. Choosing an option
// sends its lines to PUT /api/quotes/[id]/lines, replacing every line, so a
// quote with no lines, a blank count or a "pick a flower" line answers
// incomplete_quote first: no line is ever dropped without the florist seeing it.
export async function POST(request: Request, ctx: RouteContext<"/api/quotes/[id]/budget-options">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const detail = await readQuote(supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  const parsed = parseBudgetOptions(await readJson(request));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  if (cannotSend(detail.lines)) {
    return errorResponse("incomplete_quote", "The quote has no lines, or a line has a blank count or no flower picked");
  }
  const { budget } = parsed.value;

  const [saved, stems] = await Promise.all([
    supabase.from("quotes").update({ budget }).eq("id", detail.quote.id),
    stemsWithCost(supabase),
  ]);
  if (saved.error) throw new Error(`Saving the budget failed: ${saved.error.message}`);

  const byId = new Map(stems.map((stem) => [stem.id, stem]));
  // Every line has a stem and a count (cannotSend above), and stems are never deleted.
  const recipe = detail.lines.map((line) => ({ stem: byId.get(line.stemId!)!, count: line.count! }));
  const currentPrice = price(recipeCost(recipe.map(({ stem, count }) => ({ stemId: stem.id, count, costPerStem: stem.latestCost }))).cost, shop);

  // The most the flowers may cost for a price within the budget at the minimum
  // margin. None when the budget does not cover the fees: no recipe can meet it,
  // so the AI is not asked.
  const maxCost = maxRecipeCost(budget, shop);
  if (maxCost === null) return Response.json({ options: [], demo: false } satisfies BudgetOptionsResponse);
  const currentRecipeCost = recipeCost(recipe.map(({ stem, count }) => ({ stemId: stem.id, count, costPerStem: stem.latestCost }))).cost;
  const outcome = await fitToBudget({
    recipe: recipe.map(({ stem, count }) => ({ stem: stem.name, count })),
    budget,
    currentPrice,
    currentRecipeCost,
    maxRecipeCost: maxCost,
    stems,
  });
  await logAiCall(supabase, shop.id, {
    call: "fitToBudget",
    model: outcome.model,
    seconds: outcome.seconds,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    quoteId: detail.quote.id,
    receiptId: null,
    ok: outcome.ok,
    error: outcome.ok ? "" : outcome.error,
  });
  if (!outcome.ok) return errorResponse("ai_failed", `Fitting the budget failed: ${outcome.error}`);

  const options = priceBudgetOptions(outcome.result.options, stems, shop, budget);
  return Response.json({ options, demo: false } satisfies BudgetOptionsResponse);
}
