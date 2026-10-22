import type { AddStemRequest, AddStemResponse, StemListResponse } from "@/lib/contract";
import { shop, stemList } from "@/lib/fake/responses";
import { latestCost } from "@/lib/money";

// Stubs: answer fake data until a backend ticket replaces them.
export async function GET() {
  return Response.json(stemList satisfies StemListResponse);
}

export async function POST(request: Request) {
  const fields: AddStemRequest = await request.json();
  const stem = { ...fields, id: crypto.randomUUID(), shopId: shop.id, sampleSource: "", hidden: false };
  const { cost, isSample } = latestCost(stem, []);
  return Response.json({
    ...stem,
    name: `${stem.flower} - ${stem.color}`,
    latestCost: cost,
    isSample,
  } satisfies AddStemResponse);
}
