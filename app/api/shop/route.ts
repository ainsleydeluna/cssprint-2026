import type { ShopResponse, UpdateShopResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { parseShopUpdate } from "@/lib/server/fields";
import { errorResponse, readJson } from "@/lib/server/http";
import { SHOP_COLUMNS, toColumns, toShop } from "@/lib/server/rows";

export async function GET() {
  const session = await requireShop();
  if (session instanceof Response) return session;
  return Response.json(session.shop satisfies ShopResponse);
}

// Only the settings in UpdateShopRequest change; id, ownerId and the rest are ignored.
export async function PATCH(request: Request) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const parsed = parseShopUpdate(await readJson(request));
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  if (Object.keys(parsed.value).length === 0) return Response.json(session.shop satisfies UpdateShopResponse);

  const { data, error } = await session.supabase
    .from("shops")
    .update(toColumns(parsed.value))
    .eq("id", session.shop.id)
    .select(SHOP_COLUMNS)
    .single();
  if (error) throw new Error(`Updating the shop failed: ${error.message}`);
  return Response.json(toShop(data) satisfies UpdateShopResponse);
}
