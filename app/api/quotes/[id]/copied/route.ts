import type { CopiedRequest, CopiedResponse } from "@/lib/contract";
import { findQuote } from "@/lib/fake/responses";
import { errorResponse } from "@/lib/server/http";

// Stub: answers fake data until a backend ticket replaces it.
// The first copy marks the quote sent; later copies only save the text.
export async function POST(request: Request, ctx: RouteContext<"/api/quotes/[id]/copied">) {
  const detail = findQuote((await ctx.params).id);
  if (!detail) return errorResponse(404, "Quote not found");
  const { replyText }: CopiedRequest = await request.json();
  const { quote } = detail;
  return Response.json({
    ...quote,
    replyText,
    status: quote.status === "draft" ? "sent" : quote.status,
    sentAt: quote.sentAt ?? new Date().toISOString(),
    validUntil: quote.validUntil ?? "2026-10-24",
  } satisfies CopiedResponse);
}
