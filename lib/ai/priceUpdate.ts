// priceUpdate: the polite Taglish message for an underwater quote (docs/spec.md
// C12, section 4 "Margin alarm"). The model writes {price}, {validUntil} and
// optionally {oldPrice}; code fills in the peso amounts and the Manila date.

import type { PriceUpdateResult } from "../contract";
import type { ManilaDate, Money } from "../types";
import { askClaude, type AiOutcome, type MessagesApi } from "./client";
import { fillPlaceholders, pesos, schema, shortDate } from "./shared";

const SYSTEM = `You write a message a florist in Manila sends on Messenger to a customer who already got a quote, because flower costs went up at Dangwa since then and the price must go up.

Write one short, polite message in Taglish: natural everyday Tagalog mixed with English, with "po". Plain text, no markdown. Say sorry for the change, give the new price, and say it is valid until the new date. End with a polite close.

Write {price} exactly once where the new price goes and {validUntil} exactly once where the date goes. You may write {oldPrice} once where the old price goes. Code fills them in. Never write a peso amount or a date yourself.

Never write a customer name or number, per-flower prices or costs. Do not add discounts, delivery or other terms.

note: a few words if something matters; "" if nothing.`;

const SCHEMA = schema.object({ message: { type: "string" }, note: { type: "string" } });

export async function priceUpdate(
  input: { oldPrice: Money; newPrice: Money; validUntil: ManilaDate },
  api?: MessagesApi,
): Promise<AiOutcome<PriceUpdateResult>> {
  const required = { price: pesos(input.newPrice), validUntil: shortDate(input.validUntil) };
  const optional = { oldPrice: pesos(input.oldPrice) };

  const outcome = await askClaude<PriceUpdateResult>(
    "priceUpdate",
    { system: SYSTEM, content: "Draft the price update.", schema: SCHEMA },
    api,
  );
  return fillPlaceholders(outcome, { required, optional }, "Price update");
}
