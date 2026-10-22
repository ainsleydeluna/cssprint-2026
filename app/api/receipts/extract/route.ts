import { extractReceipt } from "@/lib/ai/extractReceipt";
import type { ExtractReceiptResponse } from "@/lib/contract";
import { logAiCall } from "@/lib/server/ai-calls";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { isRecord, isShopPhotoPath } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { todayInManila, toReceiptDraft } from "@/lib/server/receipts";

// Reads an uploaded receipt photo into the editable table. Saves nothing but
// the ai_calls row, which is written for failures too.
export async function POST(request: Request) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const body = await readJson(request);
  const photoPath = isRecord(body) ? body.photoPath : undefined;
  if (!isShopPhotoPath(photoPath, shop.id)) return errorResponse("invalid_request", "Invalid photoPath");

  const photo = await supabase.storage.from("receipts").download(photoPath);
  if (photo.error) return errorResponse("not_found", "Photo not found");
  // extractReceipt offers and matches visible rows only.
  const stems = await stemsWithCost(supabase);

  const outcome = await extractReceipt({
    photo: { data: new Uint8Array(await photo.data.arrayBuffer()), mediaType: "image/jpeg" },
    stems,
  });
  await logAiCall(supabase, shop.id, {
    call: "extractReceipt",
    model: outcome.model,
    seconds: outcome.seconds,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    quoteId: null,
    receiptId: null,
    ok: outcome.ok,
    error: outcome.ok ? "" : outcome.error,
  });
  // lib/contract.ts has no error code for a failed AI call yet, so this answers 500.
  if (!outcome.ok) throw new Error(`Reading the receipt failed: ${outcome.error}`);

  const draft = toReceiptDraft(outcome.result, stems, todayInManila());
  return Response.json({ ...draft, demo: false } satisfies ExtractReceiptResponse);
}
