import { describe, expect, it } from "vitest";
import type { SaveReceiptResponse, StemWithCost } from "@/lib/contract";
import { freshScan } from "./scan-state";

describe("freshScan (a clean photo step)", () => {
  it("clears every leftover of the last scan", () => {
    expect(freshScan()).toEqual({ state: { step: "pick", saved: null }, lines: [], stems: [], error: null, confirmingRescan: false });
  });
  it("after a save, keeps only the saved result to show above the photo picker", () => {
    const saved = { result: { batches: [], underwaterQuoteIds: ["q1"] } as unknown as SaveReceiptResponse, stems: [] as StemWithCost[] };
    const fresh = freshScan(saved);
    expect(fresh.state).toEqual({ step: "pick", saved });
    expect(fresh.lines).toEqual([]);
    expect(fresh.stems).toEqual([]);
    expect(fresh.error).toBeNull();
    expect(fresh.confirmingRescan).toBe(false);
  });
});
