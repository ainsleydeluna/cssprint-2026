// analyzeBouquet: a bouquet photo becomes one line per flower and per filler
// (docs/spec.md C3, section 6, decisions 7, 8, 9, 12 and 25). Code clamps the
// counts and prefills quote lines with lib/money.ts, never the model.

import type { AnalyzeBouquetResult, StemWithCost } from "../contract";
import { clampBouquet, clampCount, prefillCount } from "../money";
import type { Confidence, QuoteLine } from "../types";
import { askClaude, type AiOutcome, type MessagesApi } from "./client";
import { COUNT_PREFILL } from "./config";
import { findFlower, findStem, photoBlock, schema, stemList, type AllowedStem, type Photo } from "./shared";

const SYSTEM = `You look at a photo of a bouquet that a customer sent to a florist in Manila, and list what is in it so the florist can price it.

Return one line per kind of flower and one line per filler you can see.
- stem: the shop's row for this flower and color, copied exactly from the allowed list. If the flower is on the list but its exact color is not, pick that flower's row with the closest color, and write the real color in color and in note. Use "Other" only for a flower that is not on the list at all.
- color: your own words for the color, such as "deep red" or "blush pink".
- countLow, countHigh: how many the bouquet holds. The low end is what you can see; the high end adds the ones likely hidden. Flowers are counted in stems. A filler (listed under Fillers) is counted in bunches, usually 1 to 3.
- confidence: high when the row and count are clear, medium when one is a guess, low when both are.
- closestStem: when stem is "Other", the row a florist would use in its place: a row under Flowers, never a filler. Otherwise null.
- note: when stem is "Other", start with the flower's real name. When you picked the closest color, the real color. Otherwise a few words on anything unsure; "" if nothing.

Rules:
1. A flower's own leaves and stems are not Greenery. Only a separate filler counts as a filler line. No filler seen, no filler line.
2. For "Other", choose closestStem by price and size, not by name.
3. Count stems, not individual blooms. For flowers that grow in clusters, such as alstroemeria and spray roses, estimate the number of stems.

note: a few words about the whole photo if something matters, such as a blurry or cropped bouquet; "" if nothing.

The florist reads every note. Write notes in short, simple Taglish, such as "Wala sa listahan mo: peony", "Fuchsia ang kulay" or "Malabo ang litrato". Never write "allowed list", "row" or other words from these instructions in a note.`;

const SCHEMA = schema.object({
  lines: {
    type: "array",
    items: schema.object({
      stem: { type: "string" },
      color: { type: "string" },
      countLow: { type: "integer" },
      countHigh: { type: "integer" },
      confidence: schema.confidence,
      closestStem: schema.nullable("string"),
      note: { type: "string" },
    }),
  },
  note: { type: "string" },
});

export async function analyzeBouquet(
  input: { photo: Photo; stems: AllowedStem[] },
  api?: MessagesApi,
): Promise<AiOutcome<AnalyzeBouquetResult>> {
  const outcome = await askClaude<AnalyzeBouquetResult>(
    "analyzeBouquet",
    {
      system: SYSTEM,
      content: [photoBlock(input.photo), { type: "text", text: stemList(input.stems) }],
      schema: SCHEMA,
    },
    api,
  );
  if (!outcome.ok) return outcome;

  const named = outcome.result.lines.map((line) => {
    const stem = findStem(input.stems, line.stem);
    // A filler closest stem is dropped, so the line becomes a "pick a flower" line.
    const closest = stem ? undefined : findFlower(input.stems, line.closestStem);
    return {
      ...line,
      stem: stem?.name ?? "Other",
      closestStem: closest?.name ?? null,
      countLow: Math.min(line.countLow, line.countHigh),
      countHigh: Math.max(line.countLow, line.countHigh),
      // Other is counted as a flower, like its closest stem.
      isFiller: stem?.isFiller ?? false,
    };
  });
  const lines = mergeSameRow(named).map(({ isFiller, ...line }) => ({
    ...line,
    countLow: clampCount(line.countLow, isFiller),
    countHigh: clampCount(line.countHigh, isFiller),
  }));
  return { ...outcome, result: { lines, note: outcome.result.note } };
}

const CONFIDENCE_ORDER: Confidence[] = ["low", "medium", "high"];

/**
 * One line per shop row: lines naming the same row are added together (count
 * ranges summed, the lowest confidence, colors and notes joined), in the order
 * the row first appears. Other lines stay apart: each is a different flower.
 */
function mergeSameRow<L extends AnalyzeBouquetResult["lines"][number]>(lines: L[]): L[] {
  const merged: L[] = [];
  for (const line of lines) {
    const same = line.stem === "Other" ? undefined : merged.find((kept) => kept.stem === line.stem);
    if (!same) {
      merged.push({ ...line });
      continue;
    }
    same.countLow += line.countLow;
    same.countHigh += line.countHigh;
    if (CONFIDENCE_ORDER.indexOf(line.confidence) < CONFIDENCE_ORDER.indexOf(same.confidence)) same.confidence = line.confidence;
    same.color = joinDistinct([same.color, line.color], ", ");
    same.note = joinDistinct([same.note, line.note], "; ");
  }
  return merged;
}

function joinDistinct(parts: string[], separator: string): string {
  return [...new Set(parts.flatMap((part) => part.split(separator)).filter((part) => part !== ""))].join(separator);
}

/** A new quote line before it is saved. */
export type DraftQuoteLine = Pick<
  QuoteLine,
  "stemId" | "count" | "countLow" | "countHigh" | "confidence" | "note" | "costPerStem"
>;

/**
 * The quote's first recipe from an analyzeBouquet answer. Each line starts at
 * COUNT_PREFILL of its range and costs its row's latest cost. Other is priced
 * at its closest stem and highlighted; Other with no closest stem is a "pick a
 * flower" line at ₱0 (decision 9). Flower lines are then scaled to 200 stems.
 */
export function bouquetToLines(result: AnalyzeBouquetResult, stems: StemWithCost[]): DraftQuoteLine[] {
  const rows = result.lines.map((line) => findStem(stems, line.stem) ?? findFlower(stems, line.closestStem));
  const counts = clampBouquet(
    result.lines.map((line, i) => {
      const isFiller = rows[i]?.isFiller ?? false;
      return { count: prefillCount(line.countLow, line.countHigh, isFiller, COUNT_PREFILL), isFiller };
    }),
  );
  return result.lines.map((line, i) => ({
    stemId: rows[i]?.id ?? null,
    count: counts[i].count,
    countLow: line.countLow,
    countHigh: line.countHigh,
    confidence: line.stem === "Other" && line.confidence === "high" ? "medium" : line.confidence,
    note: line.note,
    costPerStem: rows[i]?.latestCost ?? 0,
  }));
}
