// draftReply: the Taglish reply with the price and valid-until date
// (docs/spec.md C6, section 4 "Taglish reply"). The model writes {price} and
// {validUntil}; code fills in the peso amount and the Manila date.

import type { DraftReplyResult } from "../contract";
import type { ManilaDate, Money } from "../types";
import { askClaude, type AiOutcome, type MessagesApi } from "./client";
import { countText, fillPlaceholders, pesos, schema, shortDate } from "./shared";

const SYSTEM = `You write the reply a florist in Manila sends on Messenger to a customer who asked "hm po?" about a bouquet photo.

Write one short message in Taglish: natural, polite everyday Tagalog mixed with English, with "po". Plain text, no markdown. In this order:
1. A greeting, with the shop name if there is one.
2. The flowers with their counts, in everyday words ("12 red roses", "1 bunch baby's breath"), not the row names.
3. The price: write {price} exactly once where it goes. Code fills it in.
4. Valid until: write {validUntil} exactly once where the date goes, such as "valid hanggang {validUntil}". Code fills it in.
5. A polite close.

Never write a peso amount or a date yourself. Never write a customer name or number, per-flower prices or costs. Do not add flowers, discounts, delivery or other terms.

note: a few words if something matters; "" if nothing.`;

const SCHEMA = schema.object({ message: { type: "string" }, note: { type: "string" } });

export async function draftReply(
  input: {
    /** "" when the shop has no name. */
    shopName: string;
    lines: Array<{ stem: string; count: number; isFiller: boolean }>;
    price: Money;
    validUntil: ManilaDate;
  },
  api?: MessagesApi,
): Promise<AiOutcome<DraftReplyResult>> {
  const values = { price: pesos(input.price), validUntil: shortDate(input.validUntil) };
  const lines = input.lines.map(({ stem, count, isFiller }) => `- ${stem}: ${countText(count, isFiller)}`);
  const text = [`Shop name: ${input.shopName || "none"}`, `Flowers:\n${lines.join("\n")}`].join("\n");

  const outcome = await askClaude<DraftReplyResult>("draftReply", { system: SYSTEM, content: text, schema: SCHEMA }, api);
  return fillPlaceholders(outcome, { required: values }, "Reply");
}
