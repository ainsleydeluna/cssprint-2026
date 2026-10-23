// Rules for the quote list. Pure, so list.test.ts covers them.
import type { QuoteListItem } from "@/lib/contract";
import type { Quote } from "@/lib/types";

/** The renamed label, trimmed; null when blank (Save stays off). */
export function cleanLabel(text: string): string | null {
  const label = text.trim();
  return label === "" ? null : label;
}

/**
 * An open quote whose price no longer keeps the minimum margin. Expired beats underwater:
 * the price no longer holds anyway, so it shows only its "Expired" chip.
 */
export const showsUnderwater = (q: Pick<QuoteListItem, "status" | "underwaterAt">) =>
  q.underwaterAt !== null && q.status !== "expired";

/** The banner count: the same rule as the badge. */
export const underwaterCount = (quotes: Pick<QuoteListItem, "status" | "underwaterAt">[]) =>
  quotes.filter(showsUnderwater).length;

/**
 * The list with a renamed quote's answer folded in, keeping its list-only fields. Built from
 * the newest list, so a rename answering after a delete can't bring the quote back.
 */
export const withRenamed = (quotes: QuoteListItem[], saved: Quote) =>
  quotes.map((q) => (q.id === saved.id ? { ...q, ...saved } : q));

export const withoutQuote = (quotes: QuoteListItem[], id: string) => quotes.filter((q) => q.id !== id);
