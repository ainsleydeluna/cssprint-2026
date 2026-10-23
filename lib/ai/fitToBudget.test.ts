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
  currentRecipeCost: 700,
  maxRecipeCost: 566.66,
  stems: [
    { name: "Rose - red", isFiller: false, hidden: false, latestCost: 22.5 },
    { name: "Carnation - red", isFiller: false, hidden: false, latestCost: 12 },
    { name: "Baby's breath - white", isFiller: true, hidden: false, latestCost: 80 },
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

  test("gives the most each option's flowers may cost and the current flower cost, and asks for a spread", async () => {
    const { request } = await fit();

    const text = JSON.stringify(request.messages[0].content);
    expect(text).toContain("Each option's flower cost (count × cost, added up over its lines) must be at most ₱566.66.");
    expect(text).toContain("The current flower cost is ₱700.");
    const system = JSON.stringify(request.system);
    expect(system).toContain("one option close to the most the flowers may cost, the others cheaper");
    expect(system).not.toContain("bigger share");
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

  describe("main flower", () => {
    const rows = [
      { name: "Rose - white", isFiller: false, hidden: false, latestCost: 10 },
      { name: "Carnation - white", isFiller: false, hidden: false, latestCost: 12 },
      { name: "Stargazer lily - pink", isFiller: false, hidden: false, latestCost: 150 },
      { name: "Baby's breath - white", isFiller: true, hidden: false, latestCost: 200 },
    ];
    async function fitWith(recipe: typeof input.recipe, ...options: Option[]) {
      const { api, requests } = fakeApi(fakeMessage({ options, note: "" }));
      const outcome = await fitToBudget({ ...input, recipe, stems: rows }, api);
      if (!outcome.ok) throw new Error(outcome.error);
      return { labels: outcome.result.options.map((o) => o.label), request: requests[0] };
    }

    test("is the flower line that costs the most, not the one with the most stems", async () => {
      const { labels, request } = await fitWith(
        [
          { stem: "Rose - white", count: 24 },
          { stem: "Stargazer lily - pink", count: 3 },
          { stem: "Baby's breath - white", count: 3 },
        ],
        option("Roses only", [{ stem: "Rose - white", count: 30, note: "" }]),
        option("Fewer stargazers", [{ stem: "Stargazer lily - pink", count: 2, note: "" }]),
      );

      expect(JSON.stringify(request.messages[0].content)).toContain("Main flower: Stargazer lily - pink");
      expect(labels).toEqual(["Fewer stargazers"]);
    });

    test("goes to the higher cost per stem on a tie", async () => {
      const { labels, request } = await fitWith(
        [
          { stem: "Rose - white", count: 12 },
          { stem: "Carnation - white", count: 10 },
        ],
        option("Roses only", [{ stem: "Rose - white", count: 12, note: "" }]),
        option("Fewer roses", [
          { stem: "Rose - white", count: 6, note: "" },
          { stem: "Carnation - white", count: 10, note: "" },
        ]),
      );

      expect(JSON.stringify(request.messages[0].content)).toContain("Main flower: Carnation - white");
      expect(labels).toEqual(["Fewer roses"]);
    });

    test("is defined the same way in the prompt, with labels that keep it", async () => {
      const { request } = await fitWith([{ stem: "Rose - white", count: 12 }]);

      expect(request.system).toContain("highest cost (count × cost per stem)");
      expect(request.system).toContain('"Fewer stargazers"');
      expect(request.system).toContain('"Carnations instead of white roses"');
    });
  });

  test("ignores hidden rows even when the caller passes them", async () => {
    const stems = [...input.stems, { name: "Tulip - red", isFiller: false, hidden: true, latestCost: 5 }];
    const { api, requests } = fakeApi(
      fakeMessage({
        options: [
          option("Tulips too", [
            { stem: "Rose - red", count: 12, note: "" },
            { stem: "Tulip - red", count: 5, note: "" },
          ]),
        ],
        note: "",
      }),
    );
    const outcome = await fitToBudget({ ...input, stems }, api);

    expect(JSON.stringify(requests[0].messages[0].content)).not.toContain("Tulip");
    expect(outcome.ok && outcome.result.options).toEqual([]);
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
