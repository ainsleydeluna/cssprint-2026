// priceUpdate: the polite Taglish message for an underwater quote (docs/spec.md
// C12, section 4 "Margin alarm"). Code writes the prices and date; the model
// must copy them exactly.

import type { PriceUpdateResult } from "../contract";
import type { ManilaDate, Money } from "../types";
import { askClaude, type AiOutcome, type MessagesApi } from "./client";
import { pesos, requireTexts, schema, shortDate } from "./shared";

const SYSTEM = `You write a message a florist in Manila sends on Messenger to a customer who already got a quote, because flower costs went up at Dangwa since then and the price must change.

Write one short, polite message in Taglish: natural everyday Tagalog mixed with English, with "po". Plain text, no markdown. Say sorry for the change, give the old price and the new price, and say the new price is valid until the new date. Copy both prices and the date exactly as given. End with a polite close.

Never write a customer name or number, per-flower prices or costs. Do not add discounts, delivery or other terms.

note: a few words if something matters; "" if nothing.`;

const SCHEMA = schema.object({ message: { type: "string" }, note: { type: "string" } });

export async function priceUpdate(
  input: { oldPrice: Money; newPrice: Money; validUntil: ManilaDate },
  api?: MessagesApi,
): Promise<AiOutcome<PriceUpdateResult>> {
  const oldPrice = pesos(input.oldPrice);
  const newPrice = pesos(input.newPrice);
  const validUntil = shortDate(input.validUntil);
  const text = `Old price: ${oldPrice}\nNew price: ${newPrice}\nValid until: ${validUntil}`;

  const outcome = await askClaude<PriceUpdateResult>("priceUpdate", { system: SYSTEM, content: text, schema: SCHEMA }, api);
  return requireTexts(outcome, [newPrice, validUntil, oldPrice], "Price update");
}
