import type { BudgetOptionsResponse } from "@/lib/contract";
import { fitToBudget } from "@/lib/ai/fitToBudget";
import { price, recipeCost } from "@/lib/money";
import { logAiCall } from "@/lib/server/ai-calls";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { parseBudgetOptions } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { priceBudgetOptions } from "@/lib/server/price-rules";
import { readQuote } from "@/lib/server/quotes";

// Saves the budget on the quote, asks fitToBudget for up to 3 cheaper recipes,
// prices each at latest costs and keeps those within budget and minimum margin;
// when none fit, only the cheapest, with overBudgetBy set. Choosing an option
// sends its lines to PUT /api/quotes/[id]/lines. Blank counts and "pick a
// flower" lines are left out of the recipe the AI sees.
export async function POST(request: Request, ctx: RouteContext<"/api/quotes/[id]/budget-options">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const detail = await readQuote(supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  const parsed = parseBudgetOptions(await readJson(request));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  const { budget } = parsed.value;

  const [saved, stems] = await Promise.all([
    supabase.from("quotes").update({ budget }).eq("id", detail.quote.id),
    stemsWithCost(supabase),
  ]);
  if (saved.error) throw new Error(`Saving the budget failed: ${saved.error.message}`);

  const byId = new Map(stems.map((stem) => [stem.id, stem]));
  const recipe = detail.lines.flatMap((line) => {
    const stem = line.stemId === null ? undefined : byId.get(line.stemId);
    return stem && line.count !== null ? [{ stem, count: line.count }] : [];
  });
  // Nothing to fit yet: no AI call.
  if (recipe.length === 0) return Response.json({ options: [], demo: false } satisfies BudgetOptionsResponse);
  const currentPrice = price(recipeCost(recipe.map(({ stem, count }) => ({ stemId: stem.id, count, costPerStem: stem.latestCost }))).cost, shop);

  const outcome = await fitToBudget({ recipe: recipe.map(({ stem, count }) => ({ stem: stem.name, count })), budget, currentPrice, stems });
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
  // TODO(#30): answer errorResponse("ai_failed", ...) (502) once PR #30 adds the code; until then this is a 500.
  if (!outcome.ok) throw new Error(`fitToBudget failed: ${outcome.error}`);

  const options = priceBudgetOptions(outcome.result.options, stems, shop, budget);
  return Response.json({ options, demo: false } satisfies BudgetOptionsResponse);
}
