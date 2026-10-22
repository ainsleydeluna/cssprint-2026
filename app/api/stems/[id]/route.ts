import type { UpdateStemRequest, UpdateStemResponse } from "@/lib/contract";
import { stems } from "@/lib/fake/responses";
import { errorResponse } from "@/lib/server/http";

// Stub: answers fake data until a backend ticket replaces it.
// Hiding a stem is { hidden: true }; stems are never deleted.
export async function PATCH(request: Request, ctx: RouteContext<"/api/stems/[id]">) {
  const { id } = await ctx.params;
  const stem = stems.find((row) => row.id === id);
  if (!stem) return errorResponse(404, "Stem not found");
  const changes: UpdateStemRequest = await request.json();
  const updated = { ...stem, ...changes };
  return Response.json({ ...updated, name: `${updated.flower} - ${updated.color}` } satisfies UpdateStemResponse);
}
