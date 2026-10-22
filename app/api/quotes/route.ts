import type { CreateQuoteResponse, QuoteListItem, QuoteListResponse } from "@/lib/contract";
import { analyzeBouquet, bouquetToLines } from "@/lib/ai/analyzeBouquet";
import { logAiCall } from "@/lib/server/ai-calls";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { parseCreateQuote } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { deletePhoto, downloadPhoto } from "@/lib/server/photos";
import { averageTimeToQuote, nextInquiryLabel, timeToQuoteSeconds } from "@/lib/server/quote-rules";
import { expirePassed, quotePrice } from "@/lib/server/quotes";
import { LINE_COLUMNS, QUOTE_COLUMNS, toColumns, toQuote, toQuoteLine } from "@/lib/server/rows";

// Newest first, each with its time-to-quote, and the shop's average over sent quotes.
export async function GET() {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { data, error } = await session.supabase.from("quotes").select(QUOTE_COLUMNS).order("created_at", { ascending: false });
  if (error) throw new Error(`Listing quotes failed: ${error.message}`);

  const quotes: QuoteListItem[] = (await expirePassed(session.supabase, data.map(toQuote))).map((quote) => ({
    ...quote,
    timeToQuoteSeconds: timeToQuoteSeconds(quote),
  }));
  return Response.json({
    quotes,
    averageTimeToQuoteSeconds: averageTimeToQuote(quotes.map((quote) => quote.timeToQuoteSeconds)),
  } satisfies QuoteListResponse);
}

// Runs analyzeBouquet on the uploaded bouquet photo and saves a priced draft quote, "Inquiry N".
export async function POST(request: Request) {
  // Time-to-quote starts at the photo upload, just before this request, not after the AI call.
  const createdAt = new Date().toISOString();
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const parsed = parseCreateQuote(await readJson(request), shop.id);
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  const { photoPath } = parsed.value;

  const photo = await downloadPhoto(supabase, "bouquets", photoPath);
  if (!photo) return errorResponse("invalid_request", "No bouquet photo at photoPath");
  const stems = (await stemsWithCost(supabase)).filter((stem) => !stem.hidden);
  const outcome = await analyzeBouquet({ photo: { data: photo, mediaType: "image/jpeg" }, stems });

  let quoteId: string | null = null;
  try {
    if (!outcome.ok) {
      // No quote to attach it to: the florist picks the photo again.
      await deletePhoto(supabase, "bouquets", photoPath);
      throw new Error(`analyzeBouquet failed: ${outcome.error}`);
    }
    const lines = bouquetToLines(outcome.result, stems);
    const labels = await supabase.from("quotes").select("label");
    if (labels.error) throw new Error(`Reading quote labels failed: ${labels.error.message}`);

    const quoteRow = await supabase
      .from("quotes")
      .insert({
        shop_id: shop.id,
        label: nextInquiryLabel(labels.data.map((row) => row.label)),
        photo_path: photoPath,
        price: quotePrice(lines, shop),
        created_at: createdAt,
      })
      .select(QUOTE_COLUMNS)
      .single();
    if (quoteRow.error) throw new Error(`Saving the quote failed: ${quoteRow.error.message}`);
    const quote = toQuote(quoteRow.data);

    const lineRows = await supabase
      .from("quote_lines")
      .insert(lines.map((line) => ({ ...toColumns(line), quote_id: quote.id, shop_id: shop.id })))
      .select(LINE_COLUMNS)
      .order("created_at");
    if (lineRows.error) {
      await supabase.from("quotes").delete().eq("id", quote.id);
      throw new Error(`Saving the quote lines failed: ${lineRows.error.message}`);
    }
    quoteId = quote.id;
    return Response.json({ quote, lines: lineRows.data.map(toQuoteLine), demo: false } satisfies CreateQuoteResponse);
  } finally {
    await logAiCall(supabase, shop.id, {
      call: "analyzeBouquet",
      model: outcome.model,
      seconds: outcome.seconds,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      quoteId,
      receiptId: null,
      ok: outcome.ok,
      error: outcome.ok ? "" : outcome.error,
    });
  }
}
