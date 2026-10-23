import type { CopiedResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { parseCopied } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { copyChanges } from "@/lib/server/quote-rules";
import { readQuote } from "@/lib/server/quotes";
import { QUOTE_COLUMNS, toColumns, toQuote } from "@/lib/server/rows";

// The first copy sends the quote: it stamps the sent time and the valid-until
// date (sent date plus the shop's valid-for days, Manila). Later copies save
// only the text. Answers invalid_request for an expired quote, and
// incomplete_quote while the quote has no lines, or any line has a blank count
// or is a "pick a flower" line.
export async function POST(request: Request, ctx: RouteContext<"/api/quotes/[id]/copied">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const detail = await readQuote(session.supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  if (detail.quote.status === "expired") return errorResponse("invalid_request", "This quote has expired");
  const parsed = parseCopied(await readJson(request));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);

  const copied = copyChanges(detail.quote, detail.lines, parsed.value.replyText, new Date(), session.shop.validForDays);
  if (!copied.ok) return errorResponse(copied.code, "The quote has no lines, or a line has a blank count or no flower picked");
  const { data, error } = await session.supabase
    .from("quotes")
    .update(toColumns(copied.changes))
    .eq("id", detail.quote.id)
    .select(QUOTE_COLUMNS)
    .single();
  if (error) throw new Error(`Saving the copied reply failed: ${error.message}`);
  return Response.json(toQuote(data) satisfies CopiedResponse);
}
