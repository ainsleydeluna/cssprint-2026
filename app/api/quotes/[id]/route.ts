import type { DeleteQuoteResponse, QuoteResponse, UpdateQuoteResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { parseQuoteUpdate } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { deletePhoto } from "@/lib/server/photos";
import { manilaToday, statusOn } from "@/lib/server/quote-rules";
import { readQuote } from "@/lib/server/quotes";
import { QUOTE_COLUMNS, toColumns, toQuote } from "@/lib/server/rows";

export async function GET(_request: Request, ctx: RouteContext<"/api/quotes/[id]">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const detail = await readQuote(session.supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  return Response.json(detail satisfies QuoteResponse);
}

// Rename, and edit the budget, valid-until date or reply text. Status, price and
// the sent time are never set here. Moving a sent quote's valid-until date
// expires it or reopens it.
export async function PATCH(request: Request, ctx: RouteContext<"/api/quotes/[id]">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const detail = await readQuote(session.supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  const parsed = parseQuoteUpdate(await readJson(request));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  if (Object.keys(parsed.value).length === 0) return Response.json(detail.quote satisfies UpdateQuoteResponse);

  const { quote } = detail;
  const changes = toColumns(parsed.value);
  if (parsed.value.validUntil !== undefined && quote.status !== "draft") {
    changes.status = statusOn({ status: quote.status, validUntil: parsed.value.validUntil }, manilaToday(new Date()));
  }
  const { data, error } = await session.supabase.from("quotes").update(changes).eq("id", quote.id).select(QUOTE_COLUMNS).single();
  if (error) throw new Error(`Updating the quote failed: ${error.message}`);
  return Response.json(toQuote(data) satisfies UpdateQuoteResponse);
}

// Deletes the photo first, so a failure leaves the quote and its photo together.
// Its lines go with it; its ai_calls rows stay, unlinked.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/quotes/[id]">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const detail = await readQuote(session.supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");

  await deletePhoto(session.supabase, "bouquets", detail.quote.photoPath);
  const { error } = await session.supabase.from("quotes").delete().eq("id", detail.quote.id);
  if (error) throw new Error(`Deleting the quote failed: ${error.message}`);
  return Response.json({ deleted: true } satisfies DeleteQuoteResponse);
}
