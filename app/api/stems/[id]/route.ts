import { stemName, type UpdateStemRequest, type UpdateStemResponse } from "@/lib/contract";
import { stems } from "@/lib/fake/responses";
import { latestCost } from "@/lib/money";
import { errorResponse } from "@/lib/server/http";

// Stub: answers fake data until a backend ticket replaces it.
// Hiding a stem is { hidden: true }; stems are never deleted.
export async function PATCH(request: Request, ctx: RouteContext<"/api/stems/[id]">) {
  const { id } = await ctx.params;
  const stem = stems.find((row) => row.id === id);
  if (!stem) return errorResponse("not_found", "Stem not found");
  const changes: UpdateStemRequest = await request.json();
  const updated = { ...stem, ...changes };
  // Costed with no batches, the edited row has no usable cost only when it is a bundle without a size.
  const sampleCost = latestCost(updated, []).cost;
  if (sampleCost === null) return errorResponse("invalid_bundle_size", "A bundle stem needs a bundle size above 0");
  return Response.json({
    ...updated,
    name: stemName(updated),
    // A new sample price or unit changes the latest cost until a receipt replaces it.
    latestCost: updated.isSample ? sampleCost : updated.latestCost,
  } satisfies UpdateStemResponse);
}
