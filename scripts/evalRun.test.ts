import { describe, expect, it } from "vitest";
import { missingParts, pool } from "./evalRun";

const bouquet = { rowLines: 1, rightRows: 1, countLines: 1, countsWithin2: 1, total: "within" as const, seconds: 5 };
const receipt = { lines: 1, rightLines: 1, seconds: 5 };
const full = {
  limited: false,
  missingPhotos: [],
  unreadable: [],
  uncounted: [],
  missingAnswers: [],
  runs: [{ model: "claude-opus-5-5", photoPx: 1600, bouquets: [bouquet], receipts: [receipt] }],
};

describe("missingParts", () => {
  it("is empty for a full run, which may replace results.json", () => {
    expect(missingParts(full)).toEqual([]);
  });

  it("names every skipped photo, missing answer and limit", () => {
    const parts = missingParts({
      ...full,
      limited: true,
      missingPhotos: ["photo-04.jpg"],
      unreadable: ["receipt-01.1.jpg"],
      uncounted: ["photo-18.jpg"],
      missingAnswers: ["claude-opus-5-5/1600/photo-02.jpg"],
    });
    expect(parts).toEqual([
      "limited by --limit, --model or --px",
      "photo files missing: photo-04.jpg",
      "could not read: receipt-01.1.jpg",
      "not counted yet: photo-18.jpg",
      "answers not saved: claude-opus-5-5/1600/photo-02.jpg",
    ]);
  });

  it("names a run with no bouquets, receipts or totals scored", () => {
    const parts = missingParts({
      ...full,
      runs: [
        { model: "claude-haiku-5-5", photoPx: 1280, bouquets: [], receipts: [receipt] },
        { model: "claude-haiku-5-5", photoPx: 1600, bouquets: [{ ...bouquet, total: "unscored" }], receipts: [] },
      ],
    });
    expect(parts).toEqual([
      "claude-haiku-5-5 at 1280 px: no bouquets scored",
      "claude-haiku-5-5 at 1600 px: no receipts scored",
      "claude-haiku-5-5 at 1600 px: no totals scored",
    ]);
  });

  it("names a run with nothing at all", () => {
    expect(missingParts({ ...full, runs: [] })).toEqual(["nothing scored"]);
  });
});

describe("pool", () => {
  it("runs every item, a few at a time", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    await pool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      done.push(n);
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(most).toBe(2);
  });

  it("rejects at the first failure and starts no more items", async () => {
    const started: number[] = [];
    let finishSecond = () => {};
    const run = pool([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      if (n === 1) throw new Error("disk full");
      await new Promise<void>((resolve) => (finishSecond = resolve));
    });
    // Rejects while item 2 is still running.
    await expect(run).rejects.toThrow("disk full");
    finishSecond();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(started).toEqual([1, 2]);
  });
});
