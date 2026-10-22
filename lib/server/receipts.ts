// Receipt to cost (spec C2, decisions 4, 20 and 28): the extract answer as the
// editable table, today's date in Manila, and reading saved receipts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { findStem } from "../ai/shared";
import type { ExtractReceiptResponse, ExtractReceiptResult, StemWithCost } from "../contract";
import { costPerStem, receiptLineTotal } from "../money";
import type { ManilaDate, Receipt, StockBatch } from "../types";
import { BATCH_COLUMNS, RECEIPT_COLUMNS, toReceipt, toStockBatch } from "./rows";

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

/** The shop's receipts with their stock batches: newest purchase date first, batches in entry order. Only `id` when given. */
export async function readReceipts(
  supabase: SupabaseClient,
  id?: string,
): Promise<Array<{ receipt: Receipt; batches: StockBatch[] }>> {
  let query = supabase
    .from("receipts")
    .select(`${RECEIPT_COLUMNS}, receipt_lines(${BATCH_COLUMNS})`)
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "receipt_lines" });
  if (id) query = query.eq("id", id);
  const { data, error } = await query;
  if (error) throw new Error(`Reading receipts failed: ${error.message}`);
  return data.map(({ receipt_lines: lines, ...row }) => ({
    receipt: toReceipt(row),
    batches: (lines as Record<string, unknown>[]).map(toStockBatch),
  }));
}
