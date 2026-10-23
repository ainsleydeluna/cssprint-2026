// Rules for the quote list. Pure, so list.test.ts covers them.
import type { QuoteListItem } from "@/lib/contract";

/** The renamed label, trimmed; null when blank (Save stays off). */
export function cleanLabel(text: string): string | null {
  const label = text.trim();
  return label === "" ? null : label;
}

/** Quotes still open (draft or sent) whose price no longer keeps the minimum margin. */
export const underwaterCount = (quotes: Pick<QuoteListItem, "status" | "underwaterAt">[]) =>
  quotes.filter((q) => q.underwaterAt !== null && q.status !== "expired").length;
