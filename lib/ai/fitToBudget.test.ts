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
    expect(system).toContain("Before answering, add up count × cost for each option");
    expect(system).toContain("cut it further until it is not");
  });

  describe("an option over the most the flowers may cost", () => {
    // input: Rose - red ₱22.50 a stem (the main flower), Carnation - red ₱12, Baby's breath ₱80 a bunch; at most ₱566.66.
    async function fitUnder(maxRecipeCost: number, ...options: Option[]) {
      const { api } = fakeApi(fakeMessage({ options, note: "" }));
      const outcome = await fitToBudget({ ...input, maxRecipeCost }, api);
      if (!outcome.ok) throw new Error(outcome.error);
      return outcome.result.options;
    }
    const counts = (o: Option) => o.lines.map((l) => [l.stem, l.count]);
    // A shrunk option says so on its card; one the AI kept under the cap keeps its label.
    const shrunk = (label: string) => `${label} · binawasan para pumasok sa budget`;

    test("has every count scaled down by the same share, rounded down, keeping the notes, and says so in its label", async () => {
      // ₱450 + ₱160 = ₱610; × 566.66/610: 18.6 roses → 18, 1.9 bunches → 1. ₱405 + ₱80 = ₱485.
      const [scaled] = await fitUnder(
        566.66,
        option("Fewer roses", [
          { stem: "Rose - red", count: 20, note: "Long stems" },
          { stem: "Baby's breath - white", count: 2, note: "" },
        ]),
      );
      expect(scaled).toEqual(
        option(shrunk("Fewer roses"), [
          { stem: "Rose - red", count: 18, note: "Long stems" },
          { stem: "Baby's breath - white", count: 1, note: "" },
        ]),
      );
    });

    test("keeps 1 of the main flower and 1 bunch of a kept filler, scaling further until it fits", async () => {
      // Under ₱110 only 1 rose and 1 bunch fit: ₱22.50 + ₱80 = ₱102.50.
      const [scaled] = await fitUnder(
        110,
        option("Fewer roses", [
          { stem: "Rose - red", count: 24, note: "" },
          { stem: "Baby's breath - white", count: 2, note: "" },
        ]),
      );
      expect(counts(scaled)).toEqual([["Rose - red", 1], ["Baby's breath - white", 1]]);
    });

    test("drops another flower that rounds down to 0", async () => {
      // ₱135 + ₱12 = ₱147; × 110/147: 4.5 roses → 4, 0.7 carnations → 0. ₱90.
      const [scaled] = await fitUnder(
        110,
        option("Roses and a carnation", [
          { stem: "Rose - red", count: 6, note: "" },
          { stem: "Carnation - red", count: 1, note: "" },
        ]),
      );
      expect(counts(scaled)).toEqual([["Rose - red", 4]]);
      expect(scaled.label).toBe(shrunk("Roses and a carnation"));
    });

    test("that cannot fit even at 1 rose and 1 bunch is left as it was, for the route to drop", async () => {
      const over = option("Fewer roses", [
        { stem: "Rose - red", count: 24, note: "" },
        { stem: "Baby's breath - white", count: 2, note: "" },
      ]);
      expect(await fitUnder(100, over)).toEqual([over]);
    });

    test("that ends up the same as another option is kept once", async () => {
      // 21 roses + 2 bunches (₱632.50) also scales to 18 roses + 1 bunch.
      const options = await fitUnder(
        566.66,
        option("Fewer roses", [
          { stem: "Rose - red", count: 20, note: "" },
          { stem: "Baby's breath - white", count: 2, note: "" },
        ]),
        option("A few fewer roses", [
          { stem: "Rose - red", count: 21, note: "" },
          { stem: "Baby's breath - white", count: 2, note: "" },
        ]),
        option("Carnations instead", [
          { stem: "Rose - red", count: 12, note: "" },
          { stem: "Carnation - red", count: 6, note: "" },
        ]),
      );
      expect(options.map((o) => o.label)).toEqual([shrunk("Fewer roses"), "Carnations instead"]);
    });
  });

  test("keeps at most 3 options", async () => {
    const roses = (count: number) => [{ stem: "Rose - red", count, note: "" }];
    const { options } = await fit(option("A", roses(12)), option("B", roses(11)), option("C", roses(10)), option("D", roses(9)));

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
