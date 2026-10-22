import type { UpdateStemResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { stemsWithCost } from "@/lib/server/costs";
import { parseStemUpdate } from "@/lib/server/fields";
import { DUPLICATE_NAME, errorResponse, readJson } from "@/lib/server/http";
import { STEM_COLUMNS, toColumns, toStem } from "@/lib/server/rows";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Edit a row, or hide it with { hidden: true }; stems are never deleted.
// Answers invalid_bundle_size when the edited row is "bundle" without a bundle size above 0.
export async function PATCH(request: Request, ctx: RouteContext<"/api/stems/[id]">) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse("not_found", "Stem not found");

  // Row-level security hides other shops' rows, so their ids are not found either.
  const current = await session.supabase.from("stems").select(STEM_COLUMNS).eq("id", id).maybeSingle();
  if (current.error) throw new Error(`Reading the stem failed: ${current.error.message}`);
  if (!current.data) return errorResponse("not_found", "Stem not found");

  const stem = toStem(current.data);
  const parsed = parseStemUpdate(await readJson(request), stem);
  if (!parsed.ok) return errorResponse(parsed.code, parsed.error);
  const changes = toColumns(parsed.value);
  // The starter list's source note describes the starter price, not one the florist typed.
  if (parsed.value.samplePrice !== undefined && parsed.value.samplePrice !== stem.samplePrice) changes.sample_source = "";

  if (Object.keys(changes).length > 0) {
    const { error } = await session.supabase.from("stems").update(changes).eq("id", id);
    if (error?.code === DUPLICATE_NAME) return errorResponse("invalid_request", "The shop already has a row with this name");
    if (error) throw new Error(`Updating the stem failed: ${error.message}`);
  }
  const [stem] = await stemsWithCost(session.supabase, [id]);
  return Response.json(stem satisfies UpdateStemResponse);
}
