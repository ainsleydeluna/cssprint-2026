// Receipt to cost (spec C2, decisions 4, 20 and 28): the extract answer as the
// editable table, and today's date in Manila.

import { findStem } from "../ai/shared";
import type { ExtractReceiptResponse, ExtractReceiptResult, StemWithCost } from "../contract";
import { costPerStem, receiptLineTotal } from "../money";
import type { ManilaDate } from "../types";

/** Manila is UTC+8 all year (no daylight saving), so its date is the UTC date 8 hours on. */
export function todayInManila(now = new Date()): ManilaDate {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The extract route's table from an extractReceipt answer. Row names become
 * stem ids (visible rows only); a missing total is quantity × unit price when
 * the unit is known; the cost per stem is computed once every field is there.
 */
export function toReceiptDraft(
  result: ExtractReceiptResult,
  stems: StemWithCost[],
  today: ManilaDate,
): Omit<ExtractReceiptResponse, "demo"> {
  return {
    purchaseDate: result.purchaseDate ?? today,
    lines: result.lines.map((line) => {
      const totalPaid = receiptLineTotal(line);
      const { quantity, unit, bundleSize } = line;
      return {
        rawText: line.rawText,
        stemId: findStem(stems, line.stem)?.id ?? null,
        quantity,
        unit,
        bundleSize,
        unitPrice: line.unitPrice,
        totalPaid,
        costPerStem:
          totalPaid !== null && quantity !== null && unit !== null
            ? costPerStem({ quantity, unit, bundleSize, totalPaid })
            : null,
        confidence: line.confidence,
        note: line.note,
      };
    }),
    note: result.note,
  };
}
