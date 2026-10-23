import type { AddStemResponse, StemListResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost, withCost } from "@/lib/server/costs";
import { parseNewStem } from "@/lib/server/fields";
import { DUPLICATE_NAME, errorResponse, readJson } from "@/lib/server/http";
import { STEM_COLUMNS, toColumns, toStem } from "@/lib/server/rows";

// Hidden rows included, so shop setup can unhide them.
export async function GET() {
  const session = await requireShop();
  if (session instanceof Response) return session;
  return Response.json({ stems: await stemsWithCost(session.supabase) } satisfies StemListResponse);
}

// A typed row ("Other" in the shop's list). Answers invalid_bundle_size for a bundle row without a size.
export async function POST(request: Request) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const parsed = parseNewStem(await readJson(request));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);

  const { data, error } = await session.supabase
    .from("stems")
    .insert({ ...toColumns(parsed.value), shop_id: session.shop.id, sample_source: "" })
    .select(STEM_COLUMNS)
    .single();
  if (error?.code === DUPLICATE_NAME) return errorResponse("invalid_request", "The shop already has a row with this name");
  if (error) throw new Error(`Adding the stem failed: ${error.message}`);
  // A new row has no stock batches yet, so its latest cost is the sample price.
  return Response.json(withCost(toStem(data), []) satisfies AddStemResponse);
}
