import { stemName, type AddStemRequest, type AddStemResponse, type StemListResponse } from "@/lib/contract";
import { shop, stemList } from "@/lib/fake/responses";
import { latestCost } from "@/lib/money";
import { errorResponse } from "@/lib/server/http";

// Stubs: answer fake data until a backend ticket replaces them.
export async function GET() {
  return Response.json(stemList satisfies StemListResponse);
}

export async function POST(request: Request) {
  const fields: AddStemRequest = await request.json();
  const stem = { ...fields, id: crypto.randomUUID(), shopId: shop.id, sampleSource: "", hidden: false };
  // A new stem has no batches, so its cost is null only for a bundle without a size.
  const { cost, isSample } = latestCost(stem, []);
  if (cost === null) return errorResponse("invalid_bundle_size", "A bundle stem needs a bundle size above 0");
  return Response.json({ ...stem, name: stemName(stem), latestCost: cost, isSample } satisfies AddStemResponse);
}
