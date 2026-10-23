import { describe, expect, it } from "vitest";
import { editLine, toRequest } from "./edit";
import type { EditLine } from "./QuoteLineRow";

const line = (key: string, patch: Partial<EditLine> = {}): EditLine => ({
  key, id: `id-${key}`, stemId: "rose", count: 8, countLow: 6, countHigh: 10,
  confidence: "medium", note: "Clusters; counted stems", costPerStem: 15, ...patch,
});

describe("editLine", () => {
  it("marks an edited line sure (confidence high) for −, +, typing and swapping", () => {
    const lines = [line("a"), line("b", { confidence: "low" })];
    for (const patch of [{ count: 7 }, { count: 9 }, { count: null }, { stemId: "tulip", costPerStem: 120 }]) {
      const next = editLine(lines, "b", patch);
      expect(next[1]).toEqual({ ...lines[1], ...patch, confidence: "high" });
    }
  });

  it("leaves the other lines, and the AI's note and range, as they were", () => {
    const lines = [line("a"), line("b")];
    const next = editLine(lines, "b", { count: 9 });
    expect(next[0]).toBe(lines[0]);
    expect(next[1]).toMatchObject({ note: "Clusters; counted stems", countLow: 6, countHigh: 10 });
  });

  it("puts confidence high into the recipe that gets autosaved, so it survives a reload", () => {
    const sent = toRequest(editLine([line("a"), line("b", { confidence: "low" })], "b", { count: 9 }));
    expect(sent.lines.map((l) => l.confidence)).toEqual(["medium", "high"]);
    expect(sent.lines[1]).toEqual({ id: "id-b", stemId: "rose", count: 9, countLow: 6, countHigh: 10, confidence: "high", note: "Clusters; counted stems" });
  });

  it("leaves a new line's id out of the recipe", () => {
    expect(toRequest([line("n", { id: undefined, confidence: "high" })]).lines[0]).not.toHaveProperty("id");
  });
});
