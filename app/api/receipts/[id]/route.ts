import type { DeleteReceiptResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { UUID } from "@/lib/server/fields";
import { errorResponse } from "@/lib/server/http";
import { latestCosts, recheckUnderwater } from "@/lib/server/margin-alarm";

// A saved receipt is read-only (decision 28): to fix one, delete it and scan
// again. Deleting removes its stock batches and photo, so latest cost falls
// back to the previous batch or the sample price; then open quotes are rechecked.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/receipts/[id]">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse("not_found", "Receipt not found");

  // Row-level security hides other shops' receipts, so their ids are not found either.
  const found = await supabase.from("receipts").select("photo_path, receipt_lines(stem_id)").eq("id", id).maybeSingle();
  if (found.error) throw new Error(`Reading the receipt failed: ${found.error.message}`);
  if (!found.data) return errorResponse("not_found", "Receipt not found");

  const lines = found.data.receipt_lines as Array<{ stem_id: string }>;
  const before = await latestCosts(supabase, [...new Set(lines.map((line) => line.stem_id))]);
  // Its stock batches go with it (on delete cascade).
  const deleted = await supabase.from("receipts").delete().eq("id", id);
  if (deleted.error) throw new Error(`Deleting the receipt failed: ${deleted.error.message}`);
  const removed = await supabase.storage.from("receipts").remove([found.data.photo_path]);
  // The receipt is already gone; a photo left behind must not fail the delete.
  if (removed.error) console.error(`Deleting receipt photo ${found.data.photo_path} failed: ${removed.error.message}`);

  const underwaterQuoteIds = await recheckUnderwater(supabase, shop, before);
  return Response.json({ deleted: true, underwaterQuoteIds } satisfies DeleteReceiptResponse);
}
