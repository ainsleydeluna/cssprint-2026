// fitToBudget: up to 3 versions of the recipe that keep the look and fit the
// customer's budget (docs/spec.md C5, section 4 "Fit to budget"). The model
// returns no prices; the route prices every option with lib/money.ts and drops
// any over budget or below minimum margin.

import type { FitToBudgetResult, StemWithCost } from "../contract";
import { clampBouquet, clampCount } from "../money";
import type { Money } from "../types";
import { askClaude, type AiOutcome, type MessagesApi } from "./client";
import { findStem, pesos, schema } from "./shared";

const SYSTEM = `A florist in Manila has a bouquet recipe that costs more than the customer's budget. Suggest up to 3 changed recipes that keep the look and cost less.

Keep the look, in this order:
1. Keep the main flower and its colors.
2. First reduce counts.
3. Then swap to cheaper rows of the same color.
4. Then swap to cheaper fillers.
Never go below 1 stem of the main flower. The price is the recipe cost with a markup plus fixed fees, so cut the recipe cost by a bigger share than the price must fall.

Each option is a full recipe, using only rows from the shop's list, copied exactly. Flowers are counted in stems, fillers in bunches.
- label: a short name for the change, such as "Fewer roses" or "Carnations instead of roses".
- lines: every row in the new recipe, with its count and a note ("" if nothing).
Return no prices. Return fewer options, or none, if the look cannot be kept.

note: a few words if something matters; "" if nothing.`;

const SCHEMA = schema.object({
  options: {
    type: "array",
    items: schema.object({
      label: { type: "string" },
      lines: {
        type: "array",
        items: schema.object({ stem: { type: "string" }, count: { type: "integer" }, note: { type: "string" } }),
      },
    }),
  },
  note: { type: "string" },
});

type Row = Pick<StemWithCost, "name" | "isFiller" | "latestCost">;

const unitOf = (row: Row | undefined) => (row?.isFiller ? "bunch" : "stem");

export async function fitToBudget(
  input: { recipe: Array<{ stem: string; count: number }>; budget: Money; currentPrice: Money; stems: Row[] },
  api?: MessagesApi,
): Promise<AiOutcome<FitToBudgetResult>> {
  const recipe = input.recipe.map(({ stem, count }) => {
    const unit = unitOf(findStem(input.stems, stem));
    return `- ${stem}: ${count} ${unit === "bunch" ? "bunches" : "stems"}`;
  });
  const rows = (isFiller: boolean) =>
    input.stems
      .filter((row) => row.isFiller === isFiller)
      .map((row) => `- ${row.name}: ${pesos(row.latestCost)} a ${unitOf(row)}`)
      .join("\n") || "(none)";
  const text = [
    `Current recipe:\n${recipe.join("\n")}`,
    `Current price: ${pesos(input.currentPrice)}`,
    `Budget: ${pesos(input.budget)}`,
    `Shop's list with latest costs.\nFlowers:\n${rows(false)}\nFillers:\n${rows(true)}`,
  ].join("\n\n");

  const outcome = await askClaude<FitToBudgetResult>("fitToBudget", { system: SYSTEM, content: text, schema: SCHEMA }, api);
  if (!outcome.ok) return outcome;

  const options = outcome.result.options.flatMap((option) => {
    const matched = option.lines.map((line) => ({ line, row: findStem(input.stems, line.stem) }));
    // An option with a row the shop does not have cannot be priced.
    if (matched.length === 0 || matched.some(({ row }) => !row)) return [];
    const lines = clampBouquet(
      matched.map(({ line, row }) => ({
        stem: row!.name,
        count: clampCount(line.count, row!.isFiller),
        note: line.note,
        isFiller: row!.isFiller,
      })),
    ).map(({ stem, count, note }) => ({ stem, count, note }));
    return [{ label: option.label, lines }];
  });
  return { ...outcome, result: { options: options.slice(0, 3), note: outcome.result.note } };
}
