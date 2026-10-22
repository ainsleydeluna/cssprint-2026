import type { ShopResponse, UpdateShopRequest, UpdateShopResponse } from "@/lib/contract";
import { shop } from "@/lib/fake/responses";

// Stubs: answer fake data until a backend ticket replaces them.
export async function GET() {
  return Response.json(shop satisfies ShopResponse);
}

export async function PATCH(request: Request) {
  const changes: UpdateShopRequest = await request.json();
  return Response.json({ ...shop, ...changes } satisfies UpdateShopResponse);
}
