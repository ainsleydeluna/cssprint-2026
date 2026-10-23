// The scan screen's clean start. Pure, so scan-state.test.ts covers it.
import type { SaveReceiptResponse, StemWithCost } from "@/lib/contract";
import type { DraftLine } from "./lines";

/** A just-saved receipt, shown above the photo picker: its new costs and any underwater banner. */
export type SavedNotice = { result: SaveReceiptResponse; stems: StemWithCost[] };

/**
 * The photo step with nothing left from the last scan. After a save, only the saved result
 * stays, to show above the picker until the next photo (or until the florist leaves).
 */
export function freshScan(saved: SavedNotice | null = null) {
  return {
    state: { step: "pick" as const, saved },
    lines: [] as DraftLine[],
    stems: [] as StemWithCost[],
    error: null as string | null,
    confirmingRescan: false,
  };
}
