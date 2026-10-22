import { describe, expect, test } from "vitest";
import type { AnalyzeBouquetResult, StemWithCost } from "../contract";
import { analyzeBouquet, bouquetToLines } from "./analyzeBouquet";
import { fakeApi, fakeMessage } from "./fakeApi";

const photo = { data: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg" as const };
const stems = [
  { name: "Rose - red", isFiller: false, hidden: false },
  { name: "Carnation - pink", isFiller: false, hidden: false },
  { name: "Baby's breath - white", isFiller: true, hidden: false },
  { name: "Sunflower - yellow", isFiller: false, hidden: true },
];

type Line = AnalyzeBouquetResult["lines"][number];
const line = (overrides: Partial<Line>): Line => ({
  stem: "Rose - red",
  color: "deep red",
  countLow: 10,
  countHigh: 12,
  confidence: "high",
  closestStem: null,
  note: "",
  ...overrides,
});

async function analyze(...lines: Line[]) {
  const { api, requests } = fakeApi(fakeMessage({ lines, note: "" }));
  const outcome = await analyzeBouquet({ photo, stems }, api);
  if (!outcome.ok) throw new Error(outcome.error);
  return { lines: outcome.result.lines, request: requests[0] };
}

describe("analyzeBouquet", () => {
  test("sends the photo, the row names with fillers marked, and the three counting rules", async () => {
    const { request } = await analyze();

    expect(JSON.stringify(request.messages[0].content)).toContain("Fillers:\\n- Baby's breath - white");
    expect(request.system).toContain("not Greenery");
    expect(request.system).toContain("by price and size, not by name");
    expect(request.system).toContain("Count stems, not individual blooms");
  });

  test("matches a row name ignoring capital letters and returns the shop's spelling", async () => {
    const { lines } = await analyze(line({ stem: "ROSE - red" }));

    expect(lines[0]).toMatchObject({ stem: "Rose - red", closestStem: null });
  });

  test("turns a name that is not one of the shop's rows into Other", async () => {
    const { lines } = await analyze(line({ stem: "Tulip - yellow", closestStem: "carnation - PINK" }));

    expect(lines[0]).toMatchObject({ stem: "Other", closestStem: "Carnation - pink" });
  });

  test("leaves hidden rows out of the list and turns a hidden row's name into Other", async () => {
    const { lines, request } = await analyze(line({ stem: "Sunflower - yellow", closestStem: "Sunflower - yellow" }));

    expect(JSON.stringify(request.messages[0].content)).not.toContain("Sunflower");
    expect(lines[0]).toMatchObject({ stem: "Other", closestStem: null });
  });

  test("asks for a flower row as closest stem and drops a filler one", async () => {
    const { lines, request } = await analyze(line({ stem: "Tulip - white", closestStem: "Baby's breath - white" }));

    expect(request.system).toContain("a row under Flowers, never a filler");
    expect(lines[0]).toMatchObject({ stem: "Other", closestStem: null });
  });

  test("drops a closest stem that is not one of the shop's rows", async () => {
    const { lines } = await analyze(line({ stem: "Other", closestStem: "Tulip - pink" }));

    expect(lines[0].closestStem).toBeNull();
  });

  test("clamps flower counts to 1 to 100 stems and filler counts to 1 to 5 bunches", async () => {
    const { lines } = await analyze(
      line({ countLow: 0, countHigh: 150 }),
      line({ stem: "Baby's breath - white", countLow: 2, countHigh: 8 }),
    );

    expect(lines[0]).toMatchObject({ countLow: 1, countHigh: 100 });
    expect(lines[1]).toMatchObject({ countLow: 2, countHigh: 5 });
  });

  test("puts a reversed count range in order", async () => {
    const { lines } = await analyze(line({ countLow: 14, countHigh: 9 }));

    expect(lines[0]).toMatchObject({ countLow: 9, countHigh: 14 });
  });

  test("passes a failed call through", async () => {
    const { api } = fakeApi(fakeMessage("not json"));

    expect(await analyzeBouquet({ photo, stems }, api)).toMatchObject({ ok: false });
  });
});

const rows: StemWithCost[] = [
  { id: "rose", name: "Rose - red", isFiller: false, latestCost: 22.5 },
  { id: "carnation", name: "Carnation - pink", isFiller: false, latestCost: 12 },
  { id: "breath", name: "Baby's breath - white", isFiller: true, latestCost: 80 },
].map((row) => ({
  ...row,
  shopId: "shop",
  flower: row.name.split(" - ")[0],
  color: row.name.split(" - ")[1],
  unit: "piece",
  bundleSize: null,
  samplePrice: row.latestCost,
  sampleSource: "",
  hidden: false,
  isSample: false,
}));

describe("bouquetToLines", () => {
  test("starts each line at the middle of its count range, rounded up, at the row's latest cost", () => {
    const lines = bouquetToLines({ lines: [line({ countLow: 10, countHigh: 13 })], note: "" }, rows);

    expect(lines).toEqual([
      { stemId: "rose", count: 12, countLow: 10, countHigh: 13, confidence: "high", note: "", costPerStem: 22.5 },
    ]);
  });

  test("prices Other at its closest stem and highlights it", () => {
    const [other] = bouquetToLines(
      { lines: [line({ stem: "Other", closestStem: "Carnation - pink", note: "Tulip, yellow" })], note: "" },
      rows,
    );

    expect(other).toMatchObject({ stemId: "carnation", costPerStem: 12, confidence: "medium", note: "Tulip, yellow" });
  });

  test("treats a hidden row's name as Other and ignores a filler closest stem", () => {
    const hiddenRows = rows.map((row) => (row.id === "rose" ? { ...row, hidden: true } : row));
    const lines = bouquetToLines(
      {
        lines: [
          line({ stem: "Rose - red" }),
          line({ stem: "Other", closestStem: "Baby's breath - white", note: "Statice" }),
        ],
        note: "",
      },
      hiddenRows,
    );

    expect(lines.map((l) => [l.stemId, l.costPerStem])).toEqual([
      [null, 0],
      [null, 0],
    ]);
  });

  test("makes Other with no closest stem a pick-a-flower line at ₱0", () => {
    const [other] = bouquetToLines({ lines: [line({ stem: "Other", note: "Protea" })], note: "" }, rows);

    expect(other).toMatchObject({ stemId: null, costPerStem: 0, count: 11 });
  });

  test("scales flower lines down to 200 stems a bouquet and leaves fillers alone", () => {
    const lines = bouquetToLines(
      {
        lines: [
          line({ countLow: 100, countHigh: 100 }),
          line({ stem: "Carnation - pink", countLow: 100, countHigh: 100 }),
          line({ stem: "Baby's breath - white", countLow: 5, countHigh: 5 }),
          line({ stem: "Other", countLow: 100, countHigh: 100 }),
        ],
        note: "",
      },
      rows,
    );

    expect(lines.map((l) => l.count)).toEqual([66, 66, 5, 66]);
  });
});
