// Quote rules the routes share (docs/spec.md decisions 5, 15 and section 4).
// Pure: no database, no network. Dates are Manila calendar dates; timestamps are UTC.

import type { ManilaDate, Quote, QuoteStatus } from "../types";

/** Manila is UTC+8 all year (no daylight saving). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The calendar date in Manila at `now`. */
export function manilaToday(now: Date): ManilaDate {
  return new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * A quote's status on the Manila date `today`. A sent quote's price holds
 * through its valid-until date and expires the day after; moving the date
 * later makes an expired quote sent again. A draft stays a draft.
 */
export function statusOn(quote: Pick<Quote, "status" | "validUntil">, today: ManilaDate): QuoteStatus {
  if (quote.status === "draft") return "draft";
  // ManilaDates sort correctly as strings. A sent quote always has a valid-until date (quotes_sent_complete).
  return quote.validUntil !== null && quote.validUntil < today ? "expired" : "sent";
}

/** `date` plus `days` calendar days. */
function addDays(date: ManilaDate, days: number): ManilaDate {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/**
 * The valid-until date a quote gets when its reply is first copied on `today`:
 * a date the florist set on the draft, if it has not passed, else today plus
 * the shop's valid-for days. The reply route drafts with the same date.
 */
export function validUntilOnSend(current: ManilaDate | null, today: ManilaDate, validForDays: number): ManilaDate {
  return current !== null && current >= today ? current : addDays(today, validForDays);
}

/**
 * A new quote's automatic label (decision 15): one past both the number of
 * quotes and the highest "Inquiry N" still in use, so deleting a quote never
 * makes a number repeat.
 */
export function nextInquiryLabel(labels: string[]): string {
  let highest = labels.length;
  for (const label of labels) {
    const n = /^Inquiry (\d+)$/.exec(label);
    if (n) highest = Math.max(highest, Number(n[1]));
  }
  return `Inquiry ${highest + 1}`;
}
