// The price-update screen's decisions (docs/spec.md section 4, "Margin alarm"), kept
// apart from React so they can be tested: what an error shows, saving, and copying.

import { ApiFailure } from "@/app/(app)/_components/api";
import type { ApplyPriceUpdateRequest, PriceUpdateResponse } from "@/lib/contract";
import type { Money } from "@/lib/types";

/** "₱1,220". Prices are rounded up to ₱10 (decision 3), so they are always whole. */
export const wholePesos = (amount: Money) => `₱${Math.round(amount).toLocaleString("en-US")}`;

/**
 * Whether the edited message still says the new price as the draft wrote it. The
 * apply route refuses a message without it (lib/server/price-rules.ts), so the
 * screen checks before saving.
 */
export const mentionsNewPrice = (message: string, newPrice: Money) => message.includes(wholePesos(newPrice));

/**
 * What the screen shows for a failed call: a short Taglish line per code, never the
 * server's English text. "signIn" goes to /sign-in; "retry" is the general error
 * plus "Subukan ulit" (a failed AI call, or no answer at all).
 */
export type Problem = "signIn" | "retry" | "openAgain" | "notFound" | "rateLimited" | "other";

export function problemFor(error: unknown): Problem {
  if (!(error instanceof ApiFailure) || error.code === null) return "retry";
  switch (error.code) {
    case "ai_failed":
      return "retry";
    case "unauthorized":
      return "signIn";
    // The quote expired, its flag was already cleared, or the valid-until date passed.
    case "invalid_request":
      return "openAgain";
    case "not_found":
      return "notFound";
    case "rate_limited":
      return "rateLimited";
    default:
      return "other";
  }
}

export type SaveResult<Q> = { ok: true; saved: Q } | { ok: false; failed: "missingPrice" };

/**
 * The first tap: saves the edited message with the draft's newPrice and validUntil
 * exactly as the draft route answered them. Nothing is copied here; the screen offers
 * "Kopyahin" only after this succeeds, so the new price never reaches the customer
 * unless the server saved it. A server refusal throws.
 */
export async function saveDraft<Q>(
  apply: (req: ApplyPriceUpdateRequest) => Promise<Q>,
  draft: Pick<PriceUpdateResponse, "newPrice" | "validUntil">,
  message: string,
): Promise<SaveResult<Q>> {
  if (!mentionsNewPrice(message, draft.newPrice)) return { ok: false, failed: "missingPrice" };
  return { ok: true, saved: await apply({ message, newPrice: draft.newPrice, validUntil: draft.validUntil }) };
}

/**
 * The second tap, "Kopyahin": a tap of its own, because phones allow the clipboard
 * only straight after a tap. false when the phone refuses.
 */
export async function copyMessage(writeClipboard: (text: string) => Promise<void>, text: string): Promise<boolean> {
  try {
    await writeClipboard(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * After saving, which button is the main one. "back" once the message is copied, and
 * also when the server kept the underwater flag: the saved price is still too low, so
 * the screen should not nudge the florist to send it.
 */
export const leadButton = (saved: { stillUnderwater: boolean; copied: boolean }): "copy" | "back" =>
  saved.stillUnderwater || saved.copied ? "back" : "copy";
