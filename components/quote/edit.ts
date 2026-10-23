// How a florist's edit changes the recipe, and the recipe the lines route is sent. Pure: edit.test.ts.
import type { UpdateQuoteLinesRequest, UpdateQuoteLinesResponse } from "@/lib/contract";
import type { Quote } from "@/lib/types";
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

/**
 * The lines autosave's send: saves the recipe, then hands the answer's quote up, since a lines
 * save can reprice the quote and clear its saved reply.
 */
export const sendLines =
  (save: (req: UpdateQuoteLinesRequest) => Promise<UpdateQuoteLinesResponse>, onQuote: (quote: Quote) => void) =>
  async (lines: EditLine[]) => {
    const answer = await save(toRequest(lines));
    onQuote(answer.quote);
    return answer;
  };
