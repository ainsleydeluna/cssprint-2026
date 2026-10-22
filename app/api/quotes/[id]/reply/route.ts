import type { DraftReplyResponse } from "@/lib/contract";
import { draftReply, findQuote } from "@/lib/fake/responses";
import { errorResponse } from "@/lib/server/http";

// Stub: answers fake data until a backend ticket replaces it.
export async function POST(_request: Request, ctx: RouteContext<"/api/quotes/[id]/reply">) {
  if (!findQuote((await ctx.params).id)) return errorResponse("not_found", "Quote not found");
  return Response.json(draftReply satisfies DraftReplyResponse);
}
