// Rules for drafting and copying the reply. Pure, so copy.test.ts covers them.
import { t } from "@/lib/strings";
import type { Quote, QuoteLine } from "@/lib/types";

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

/** A time-to-quote in its largest two units: "45 seg", "4 min 12 seg", "1 oras 5 min". */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = hours
    ? [t("quote", "hours", { n: hours }), minutes ? t("quote", "minutes", { n: minutes }) : null]
    : minutes
      ? [t("quote", "minutes", { n: minutes }), seconds ? t("quote", "seconds", { n: seconds }) : null]
      : [t("quote", "seconds", { n: seconds })];
  return parts.filter((p) => p !== null).join(" ");
}

/**
 * True once the florist changed the reply from the text the server last gave (the draft,
 * or the saved text). "Gumawa ulit" then asks first, since a new draft replaces it.
 */
export const replyEdited = (message: string, serverText: string) => message !== serverText;
