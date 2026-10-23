// Rules for one receipt line while the florist checks it. Pure, so lines.test.ts covers them.
import type { SaveReceiptRequest, StemWithCost } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { Confidence, Unit } from "@/lib/types";

/** One receipt line while the florist edits it. Numbers stay as typed until save. */
export type DraftLine = {
  key: string;
  rawText: string;
  stemId: string | null;
  quantity: string;
  /** "" when the receipt doesn't say; the florist must choose one. */
  unit: Unit | "";
  bundleSize: string;
  totalPaid: string;
  unitPrice: number | null;
  confidence: Confidence;
  note: string;
  /** True once the florist has changed anything on the line. */
  edited: boolean;
};

export type LineField = "stem" | "quantity" | "unit" | "bundleSize" | "totalPaid";

/** A typed number with ₱, commas and spaces allowed ("₱1,200"); NaN when blank or not a number. */
export function parseAmount(text: string): number {
  const bare = text.replace(/[₱,\s]/g, "");
  return bare === "" ? NaN : Number(bare);
}

/** Two decimals, half up, the same way lib/money.ts rounds (its roundMoney isn't exported). */
const roundMoney = (amount: number) => Math.round(Number((amount * 100).toPrecision(15))) / 100;

/**
 * Sample price for a new stem row made from this line: what one unit cost, in the line's
 * current unit (total paid ÷ quantity). 0 when either is missing.
 */
export function sampleFromLine(line: Pick<DraftLine, "quantity" | "totalPaid">): number {
  const quantity = parseAmount(line.quantity);
  const totalPaid = parseAmount(line.totalPaid);
  return quantity > 0 && totalPaid >= 0 ? roundMoney(totalPaid / quantity) : 0;
}

/** Matched means a stem row that exists and isn't hidden. */
export const isMatched = (stemId: string | null, stems: Pick<StemWithCost, "id" | "hidden">[]) =>
  stems.some((s) => s.id === stemId && !s.hidden);

/** The fields that still keep this line from being saved. */
export function lineProblems(line: DraftLine, stems: Pick<StemWithCost, "id" | "hidden">[]): Set<LineField> {
  const problems = new Set<LineField>();
  if (!isMatched(line.stemId, stems)) problems.add("stem");
  if (!(parseAmount(line.quantity) > 0)) problems.add("quantity");
  if (!line.unit) problems.add("unit");
  const bundleSize = parseAmount(line.bundleSize);
  if (line.unit === "bundle" && !(Number.isInteger(bundleSize) && bundleSize > 0)) problems.add("bundleSize");
  if (!(parseAmount(line.totalPaid) >= 0)) problems.add("totalPaid");
  return problems;
}

/**
 * Why the receipt can't be saved yet, or null. With no lines, adds the AI's note
 * (e.g. the photo isn't readable) so the florist knows why.
 */
export function saveBlocker(lines: DraftLine[], stems: Pick<StemWithCost, "id" | "hidden">[], note: string): string | null {
  if (lines.length === 0) return note.trim() ? `${t("scan", "noLines")} ${t("scan", "aiNote", { note: note.trim() })}` : t("scan", "noLines");
  // A line matched to a hidden stem counts as unmatched.
  const unmatched = lines.filter((l) => !isMatched(l.stemId, stems)).length;
  if (unmatched) return t("scan", "unmatched", { n: unmatched });
  const incomplete = lines.filter((l) => [...lineProblems(l, stems)].some((p) => p !== "stem")).length;
  return incomplete ? t("scan", "incomplete", { n: incomplete }) : null;
}

/**
 * True once the florist changed the table the AI read: edited or removed a line, or
 * changed the date. Scanning again then asks first, since those changes would be lost.
 */
export function hasEdits(lines: DraftLine[], purchaseDate: string, read: { lineCount: number; purchaseDate: string }): boolean {
  return lines.length !== read.lineCount || lines.some((l) => l.edited) || purchaseDate !== read.purchaseDate;
}

/** The line as the save route takes it, or null while it has a problem. */
export function toInput(line: DraftLine, stems: Pick<StemWithCost, "id" | "hidden">[]): SaveReceiptRequest["lines"][number] | null {
  if (lineProblems(line, stems).size > 0 || !line.stemId || !line.unit) return null;
  return {
    stemId: line.stemId,
    quantity: parseAmount(line.quantity),
    unit: line.unit,
    bundleSize: line.unit === "bundle" ? parseAmount(line.bundleSize) : null,
    totalPaid: parseAmount(line.totalPaid),
  };
}
