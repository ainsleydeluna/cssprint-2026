import type { AccuracyResponse } from "@/lib/contract";
import { countCalls, liveStats, readEvalResults } from "@/lib/server/accuracy";
import { requireShop } from "@/lib/server/auth";

/**
 * The Data API answers at most 1,000 rows by default, so median seconds and
 * costs cover the newest 1,000 calls; the call counts come from count queries.
 */
const MAX_CALLS = 1000;

// The bake-off results from fixtures/eval/results.json (empty until
// scripts/eval.ts writes it) and live numbers from the shop's ai_calls rows.
export async function GET() {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const [results, counts, calls] = await Promise.all([
    readEvalResults(),
    countCalls(session.supabase),
    session.supabase
      .from("ai_calls")
      .select("call, model, seconds, input_tokens, output_tokens, quote_id")
      .order("created_at", { ascending: false })
      .limit(MAX_CALLS),
  ]);
  if (calls.error) throw new Error(`Reading AI calls failed: ${calls.error.message}`);

  const rows = calls.data.map((row) => ({
    call: row.call,
    model: String(row.model),
    seconds: Number(row.seconds),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    quoteId: row.quote_id === null ? null : String(row.quote_id),
  }));
  return Response.json({ eval: results, ...liveStats(rows, counts) } satisfies AccuracyResponse);
}
