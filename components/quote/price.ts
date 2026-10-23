// An underwater quote's new price: the same formula as the server (lib/money.ts) at each stem's latest cost.
import type { StemWithCost } from "@/lib/contract";
import { price, recipeCost } from "@/lib/money";
import type { QuoteLine, Shop } from "@/lib/types";

export function priceAtLatest(
  lines: Pick<QuoteLine, "stemId" | "count" | "costPerStem">[],
  stems: Pick<StemWithCost, "id" | "latestCost">[],
  shop: Pick<Shop, "markupPercent" | "wrapFee" | "laborFee">,
): number {
  const latest = new Map(stems.map((s) => [s.id, s.latestCost]));
  const atLatest = lines.map((l) => ({ ...l, costPerStem: (l.stemId === null ? undefined : latest.get(l.stemId)) ?? l.costPerStem }));
  return price(recipeCost(atLatest).cost, shop);
}
