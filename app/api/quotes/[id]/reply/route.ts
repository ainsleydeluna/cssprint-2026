import type { DraftReplyResponse } from "@/lib/contract";
import { draftReply } from "@/lib/ai/draftReply";
import { logAiCall } from "@/lib/server/ai-calls";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { errorResponse } from "@/lib/server/http";
import { cannotSend, manilaToday, validUntilOnSend } from "@/lib/server/quote-rules";
import { readQuote } from "@/lib/server/quotes";

// Drafts the Taglish reply and saves its text on a draft quote; a sent quote
// keeps the text that was copied. Each press of "Regenerate" is a new live
// call. A draft is written with the valid-until date its first copy will
// stamp. Answers invalid_request for an expired quote, and incomplete_quote
// while the quote has no lines, or any line has a blank count or is a "pick a
// flower" line.
export async function POST(_request: Request, ctx: RouteContext<"/api/quotes/[id]/reply">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const detail = await readQuote(supabase, (await ctx.params).id);
  if (!detail) return errorResponse("not_found", "Quote not found");
  const { quote, lines } = detail;
  if (quote.status === "expired") return errorResponse("invalid_request", "This quote has expired");
  if (cannotSend(lines)) return errorResponse("incomplete_quote", "The quote has no lines, or a line has a blank count or no flower picked");

  const stems = new Map((await stemsWithCost(supabase, lines.map((line) => line.stemId!))).map((stem) => [stem.id, stem]));
  const outcome = await draftReply({
    shopName: shop.name,
    lines: lines.map((line) => {
      const stem = stems.get(line.stemId!)!;
      return { stem: stem.name, count: line.count!, isFiller: stem.isFiller };
    }),
    // A quote is priced when it is created, and a sent quote always has both (quotes_sent_complete).
    price: quote.price!,
    validUntil:
      quote.status === "draft" ? validUntilOnSend(quote.validUntil, manilaToday(new Date()), shop.validForDays) : quote.validUntil!,
  });
  await logAiCall(supabase, shop.id, {
    call: "draftReply",
    model: outcome.model,
    seconds: outcome.seconds,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    quoteId: quote.id,
    receiptId: null,
    ok: outcome.ok,
    error: outcome.ok ? "" : outcome.error,
  });
  if (!outcome.ok) return errorResponse("ai_failed", `Drafting the reply failed: ${outcome.error}`);

  if (quote.status === "draft") {
    const { error } = await supabase.from("quotes").update({ reply_text: outcome.result.message }).eq("id", quote.id);
    if (error) throw new Error(`Saving the reply failed: ${error.message}`);
  }
  return Response.json({ message: outcome.result.message, demo: false } satisfies DraftReplyResponse);
}
