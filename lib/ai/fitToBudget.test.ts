import { describe, expect, test } from "vitest";
import type { FitToBudgetResult } from "../contract";
import { fakeApi, fakeMessage } from "./fakeApi";
import { fitToBudget } from "./fitToBudget";

const input = {
  recipe: [
    { stem: "Rose - red", count: 24 },
    { stem: "Baby's breath - white", count: 2 },
  ],
  budget: 1000,
  currentPrice: 1430,
  stems: [
    { name: "Rose - red", isFiller: false, latestCost: 22.5 },
    { name: "Carnation - red", isFiller: false, latestCost: 12 },
    { name: "Baby's breath - white", isFiller: true, latestCost: 80 },
  ],
};

type Option = FitToBudgetResult["options"][number];
const option = (label: string, lines: Option["lines"]): Option => ({ label, lines });

async function fit(...options: Option[]) {
  const { api, requests } = fakeApi(fakeMessage({ options, note: "" }));
  const outcome = await fitToBudget(input, api);
  if (!outcome.ok) throw new Error(outcome.error);
  return { options: outcome.result.options, request: requests[0] };
}

describe("fitToBudget", () => {
  test("sends the recipe, the budget, the current price and the rows with latest costs", async () => {
    const { request } = await fit();

    const text = JSON.stringify(request.messages[0].content);
    expect(text).toContain("Rose - red: 24 stems");
    expect(text).toContain("Budget: ₱1,000");
    expect(text).toContain("Current price: ₱1,430");
    expect(text).toContain("Carnation - red: ₱12 a stem");
    expect(text).toContain("Baby's breath - white: ₱80 a bunch");
  });

  test("keeps at most 3 options", async () => {
    const lines = [{ stem: "Rose - red", count: 12, note: "" }];
    const { options } = await fit(option("A", lines), option("B", lines), option("C", lines), option("D", lines));

    expect(options.map((o) => o.label)).toEqual(["A", "B", "C"]);
  });

  test("matches row names ignoring capital letters", async () => {
    const { options } = await fit(option("Fewer roses", [{ stem: "rose - RED", count: 12, note: "" }]));

    expect(options[0].lines[0].stem).toBe("Rose - red");
  });

  test("drops an option that names a row the shop does not have", async () => {
    const { options } = await fit(
      option("Tulips instead", [{ stem: "Tulip - red", count: 10, note: "" }]),
      option("Fewer roses", [{ stem: "Rose - red", count: 12, note: "" }]),
    );

    expect(options.map((o) => o.label)).toEqual(["Fewer roses"]);
  });

  test("drops an option without the main flower", async () => {
    const { options } = await fit(
      option("Carnations only", [{ stem: "Carnation - red", count: 20, note: "" }]),
      option("Fewer roses", [{ stem: "Rose - red", count: 12, note: "" }]),
    );

    expect(options.map((o) => o.label)).toEqual(["Fewer roses"]);
  });

  test("clamps counts to 1 to 100 stems and 1 to 5 filler bunches", async () => {
    const { options } = await fit(
      option("Odd", [
        { stem: "Rose - red", count: 0, note: "" },
        { stem: "Baby's breath - white", count: 9, note: "" },
      ]),
    );

    expect(options[0].lines.map((l) => l.count)).toEqual([1, 5]);
  });
});
