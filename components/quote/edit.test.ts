import { describe, expect, it, vi } from "vitest";
import type { UpdateQuoteLinesResponse } from "@/lib/contract";
import type { Quote } from "@/lib/types";
import { editLine, sendLines, toRequest } from "./edit";
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

describe("sendLines (the lines autosave's send)", () => {
  it("saves the lines, then hands the answer's quote up, so replyText and price follow the server's", async () => {
    // With #46, saving a draft's lines clears its saved reply and reprices it.
    const quote = { id: "q1", price: 1890, replyText: "" } as Quote;
    const answer = { quote, lines: [] } as unknown as UpdateQuoteLinesResponse;
    const save = vi.fn(async () => answer);
    const onQuote = vi.fn();
    const lines = [line("a")];

    await expect(sendLines(save, onQuote)(lines)).resolves.toBe(answer);
    expect(save).toHaveBeenCalledWith(toRequest(lines));
    expect(onQuote).toHaveBeenCalledWith(quote);
  });
  it("hands nothing up when the save fails", async () => {
    const onQuote = vi.fn();
    const failing = sendLines(async () => {
      throw new Error("offline");
    }, onQuote);
    await expect(failing([line("a")])).rejects.toThrow("offline");
    expect(onQuote).not.toHaveBeenCalled();
  });
});
