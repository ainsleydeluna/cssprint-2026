// Rules for drafting and copying the reply. Pure, so copy.test.ts covers them.
import { statusOn } from "@/lib/server/quote-rules";
import { t } from "@/lib/strings";
import type { ManilaDate, Quote, QuoteLine } from "@/lib/types";

/**
 * Why the reply can't be drafted or copied yet, or null. The same rule as the server's
 * incomplete_quote (lib/server/quote-rules.ts cannotSend): no lines, a "pick a flower" line,
 * or a blank count.
 */
export function copyBlocker(lines: Pick<QuoteLine, "stemId" | "count">[]): string | null {
  if (lines.length === 0) return t("quote", "noLines");
  const noFlower = lines.filter((l) => l.stemId === null).length;
  const noCount = lines.filter((l) => l.count === null).length;
  const reasons = [
    noFlower ? t("quote", "needFlower", { n: noFlower }) : null,
    noCount ? t("quote", "needCount", { n: noCount }) : null,
  ].filter((r) => r !== null);
  return reasons.length ? reasons.join(" ") : null;
}

export type CopyResult =
  | { ok: true; quote: Quote }
  | { ok: false; failed: "clipboard" }
  | { ok: false; failed: "save"; error: unknown };

/**
 * Copies the reply: the clipboard first, so a refused clipboard never marks the quote sent,
 * then the server (POST copied), which sends the quote on the first copy.
 * writeClipboard is called before anything awaits, so it stays inside the tap (iOS needs that).
 */
export async function copyReply(
  text: string,
  deps: { writeClipboard: (text: string) => Promise<void>; markCopied: (text: string) => Promise<Quote> },
): Promise<CopyResult> {
  try {
    await deps.writeClipboard(text);
  } catch {
    return { ok: false, failed: "clipboard" };
  }
  try {
    return { ok: true, quote: await deps.markCopied(text) };
  } catch (error) {
    return { ok: false, failed: "save", error };
  }
}

/**
 * True once the florist changed the reply from the text the server last gave (the draft,
 * or the saved text). "Gumawa ulit" then asks first, since a new draft replaces it.
 */
export const replyEdited = (message: string, serverText: string) => message !== serverText;

export type QuoteLock = { reason: string; draftToo: boolean };

/**
 * What a sent quote's state blocks, with the reason shown. Expired: no new draft and no copy
 * (the price no longer holds). Underwater: no copy of the old price; draft a price update instead.
 * `today` (Manila) catches a quote that expired while the page stayed open.
 */
export function quoteLock(quote: Pick<Quote, "status" | "validUntil" | "underwaterAt">, today: ManilaDate): QuoteLock | null {
  if (quote.status === "expired" || statusOn(quote, today) === "expired") return { reason: t("quote", "expired"), draftToo: true };
  if (quote.status === "sent" && quote.underwaterAt !== null) return { reason: t("quote", "underwaterBlock"), draftToo: false };
  return null;
}
