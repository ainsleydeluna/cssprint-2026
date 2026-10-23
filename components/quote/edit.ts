// How a florist's edit changes the recipe, and the recipe the lines route is sent. Pure: edit.test.ts.
import type { UpdateQuoteLinesRequest } from "@/lib/contract";
import type { EditLine } from "./QuoteLineRow";

/**
 * Applies an edit (−, +, a typed count, a swapped flower) to one line. The florist has now
 * checked that line, so it becomes sure (confidence "high"), which is saved with it.
 */
export const editLine = (lines: EditLine[], key: string, patch: Partial<EditLine>): EditLine[] =>
  lines.map((l) => (l.key === key ? { ...l, ...patch, confidence: "high" } : l));

/** The whole recipe for PUT /api/quotes/[id]/lines; new lines have no id yet. */
export const toRequest = (lines: EditLine[]): UpdateQuoteLinesRequest => ({
  lines: lines.map(({ id, stemId, count, countLow, countHigh, confidence, note }) => ({
    ...(id ? { id } : {}),
    stemId, count, countLow, countHigh, confidence, note,
  })),
});
