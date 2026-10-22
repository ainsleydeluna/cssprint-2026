import type { ReceiptListResponse, SaveReceiptResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { parseSaveReceipt } from "@/lib/server/fields";
import { DUPLICATE_NAME, errorResponse, readJson } from "@/lib/server/http";
import { latestCosts, recheckUnderwater } from "@/lib/server/margin-alarm";
import { readReceipts, todayInManila } from "@/lib/server/receipts";

// Newest purchase date first.
export async function GET() {
  const session = await requireShop();
  if (session instanceof Response) return session;
  return Response.json({ receipts: await readReceipts(session.supabase) } satisfies ReceiptListResponse);
}

// Saves the checked table: the receipt and one stock batch per line, in one
// transaction (save_receipt). Every line must be matched and have a cost per
// stem, which the server computes. Then rechecks open quotes (margin alarm).
export async function POST(request: Request) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { supabase, shop } = session;
  const parsed = parseSaveReceipt(await readJson(request), { shopId: shop.id, today: todayInManila() });
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  const { photoPath, purchaseDate, lines } = parsed.value;

  // Row-level security hides other shops' stems, so their ids are unknown here.
  const stemIds = [...new Set(lines.map((line) => line.stemId))];
  const known = await supabase.from("stems").select("id").in("id", stemIds);
  if (known.error) throw new Error(`Reading stems failed: ${known.error.message}`);
  if (known.data.length !== stemIds.length) return errorResponse("invalid_request", "A line's stem is not the shop's");

  const before = await latestCosts(supabase, stemIds);
  const saved = await supabase.rpc("save_receipt", { purchase_date: purchaseDate, photo_path: photoPath, lines });
  // A second save of the same photo, such as a double tap on Save (receipts_photo_path_key).
  if (saved.error?.code === DUPLICATE_NAME) return errorResponse("invalid_request", "This photo is already saved as a receipt");
  if (saved.error) throw new Error(`Saving the receipt failed: ${saved.error.message}`);
  const [{ receipt, batches }] = await readReceipts(supabase, String(saved.data));

  const underwaterQuoteIds = await recheckUnderwater(supabase, shop, before);
  return Response.json({ receipt, batches, underwaterQuoteIds } satisfies SaveReceiptResponse);
}
