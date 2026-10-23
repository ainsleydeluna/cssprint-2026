// extractReceipt: a receipt photo becomes lines as written (docs/spec.md C2,
// section 6, decisions 6, 7 and 20). Code, not the AI, computes missing totals
// and costs later with lib/money.ts.

import type { ExtractReceiptResult } from "../contract";
import type { Unit } from "../types";
import { askClaude, type AiOutcome, type MessagesApi } from "./client";
import type { ModelId } from "./config";
import { findStem, isManilaDate, photoBlock, schema, stemList, type AllowedStem, type Photo } from "./shared";

const UNITS: Unit[] = ["dozen", "per10", "bundle", "bunch", "piece"];

const SYSTEM = `You read photos of flower receipts and buy lists from Dangwa flower market in Manila. They are often handwritten, in English, Tagalog or shorthand.

Return one line per purchase written on the receipt.
- rawText: the line exactly as written.
- stem: the shop's row this line is, copied exactly from the allowed list, or null if no row fits or you cannot tell which. When the line does not write the color and the list has more than one color of that flower, you cannot tell which: use null, so the florist picks the color.
- quantity, unit, bundleSize, unitPrice, totalPaid: as written; null when not written. Never compute a missing number.
- unit: the unit written on this line, not the flower's usual unit. "dz" or "doz" is dozen, "per 10" is per10, "bndl" or "bdl" is bundle, "pc" or "pcs" is piece. "20pc @15" is 20 piece at 15 each.
- A filler (listed under Fillers) sold per bundle is one bunch: use unit bunch and bundleSize null.
- bundleSize: stems per bundle, only for unit bundle and only if written.
- unitPrice: the price of one unit, such as "@150". totalPaid: the line total. Pesos as plain numbers, no ₱ or commas.
- confidence: high when every field is clear, medium when one is a guess, low when the line is hard to read.
- note: a few words on anything unclear or assumed; "" if nothing.

purchaseDate: the purchase date as YYYY-MM-DD if written, else null.
note: a few words about the whole receipt if something matters; "" if nothing.

The florist reads every note. Write notes in short, simple Taglish, such as "Hindi nakasulat ang kulay", "Wala sa listahan mo: petunia" or "Malabo ang presyo". Never write "allowed list", "row" or other words from these instructions in a note.`;

const SCHEMA = schema.object({
  purchaseDate: schema.nullable("string"),
  lines: {
    type: "array",
    items: schema.object({
      rawText: { type: "string" },
      stem: schema.nullable("string"),
      quantity: schema.nullable("number"),
      unit: schema.nullable("string", { enum: UNITS }),
      bundleSize: schema.nullable("integer"),
      unitPrice: schema.nullable("number"),
      totalPaid: schema.nullable("number"),
      confidence: schema.confidence,
      note: { type: "string" },
    }),
  },
  note: { type: "string" },
});

export async function extractReceipt(
  input: { photo: Photo; stems: AllowedStem[]; model?: ModelId },
  api?: MessagesApi,
): Promise<AiOutcome<ExtractReceiptResult>> {
  const outcome = await askClaude<ExtractReceiptResult>(
    "extractReceipt",
    {
      system: SYSTEM,
      content: [photoBlock(input.photo), { type: "text", text: stemList(input.stems) }],
      schema: SCHEMA,
      model: input.model,
    },
    api,
  );
  if (!outcome.ok) return outcome;

  const { purchaseDate, lines, note } = outcome.result;
  return {
    ...outcome,
    result: {
      purchaseDate: purchaseDate !== null && isManilaDate(purchaseDate) ? purchaseDate : null,
      lines: lines.map((line) => {
        const stem = findStem(input.stems, line.stem);
        const fillerBundle = stem?.isFiller && line.unit === "bundle";
        return {
          ...line,
          stem: stem?.name ?? null,
          ...(fillerBundle && { unit: "bunch" as const, bundleSize: null }),
        };
      }),
      note,
    },
  };
}
