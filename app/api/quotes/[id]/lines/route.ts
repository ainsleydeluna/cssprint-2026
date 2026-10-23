import type { UpdateQuoteLinesResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { parseQuoteLines } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { recipeChanged } from "@/lib/server/quote-rules";
import { quotePrice, readQuote } from "@/lib/server/quotes";
import { toColumns } from "@/lib/server/rows";

// Autosave: the whole recipe, debounced on every edit. Counts are saved as the
// florist typed them. Each line costs its stem's latest cost, and the server
// reprices the quote. A change of stems, counts or price clears its saved reply
// text.
// Only a draft's lines change: a sent quote's price changes through the price
// update.
export async function PUT(request: Request, ctx: RouteContext<"/api/quotes/[id]/lines">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const detail = await readQuote(supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  if (detail.quote.status !== "draft") return errorResponse("invalid_request", "Only a draft quote's lines can be edited");

  const stems = await stemsWithCost(supabase);
  const parsed = parseQuoteLines(await readJson(request), { stems, lineIds: detail.lines.map((line) => line.id) });
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  const costs = new Map(stems.map((stem) => [stem.id, stem.latestCost]));
  // A "pick a flower" line has no stem, so it costs nothing.
  const lines = parsed.value.map(({ id, ...line }) => ({
    id,
    fields: { ...line, costPerStem: line.stemId === null ? 0 : costs.get(line.stemId)! },
  }));

  const kept = new Set(lines.map((line) => line.id));
  const removed = detail.lines.filter((line) => !kept.has(line.id)).map((line) => line.id);
  if (removed.length > 0) {
    const { error } = await supabase.from("quote_lines").delete().in("id", removed);
    if (error) throw new Error(`Removing quote lines failed: ${error.message}`);
  }
  const updated = await Promise.all(
    lines
      .filter((line) => line.id !== undefined)
      .map((line) => supabase.from("quote_lines").update(toColumns(line.fields)).eq("id", line.id!)),
  );
  const failed = updated.find((result) => result.error)?.error;
  if (failed) throw new Error(`Updating quote lines failed: ${failed.message}`);
  const added = lines
    .filter((line) => line.id === undefined)
    .map((line) => ({ ...toColumns(line.fields), quote_id: detail.quote.id, shop_id: shop.id }));
  if (added.length > 0) {
    const { error } = await supabase.from("quote_lines").insert(added);
    if (error) throw new Error(`Adding quote lines failed: ${error.message}`);
  }

  // A saved reply names the old recipe and price, so a new recipe or a new price
  // (latest costs moved since the last save) clears it. An autosave that changes
  // neither keeps the florist's edited reply.
  const price = quotePrice(lines.map((line) => line.fields), shop);
  const stale = recipeChanged(detail.lines, parsed.value) || price !== detail.quote.price;
  const changes = stale ? { price, reply_text: "" } : { price };
  const { error } = await supabase.from("quotes").update(changes).eq("id", detail.quote.id);
  if (error) throw new Error(`Repricing the quote failed: ${error.message}`);
  return Response.json((await readQuote(supabase, detail.quote.id))! satisfies UpdateQuoteLinesResponse);
}
