// The price-update screen's decisions (docs/spec.md section 4, "Margin alarm"), kept
// apart from React so they can be tested: what an error shows, and copying the message.

import { ApiFailure } from "@/app/(app)/_components/api";
import type { ApplyPriceUpdateRequest, PriceUpdateResponse } from "@/lib/contract";
import type { Money } from "@/lib/types";

/** "₱1,220". Prices are rounded up to ₱10 (decision 3), so they are always whole. */
export const wholePesos = (amount: Money) => `₱${Math.round(amount).toLocaleString("en-US")}`;

/**
 * Whether the edited message still says the new price as the draft wrote it. The
 * apply route refuses a message without it (lib/server/price-rules.ts), so the
 * screen checks before copying, not after the customer may already have it.
 */
export const mentionsNewPrice = (message: string, newPrice: Money) => message.includes(wholePesos(newPrice));

/** What the screen shows for a failed call. */
export type Problem = { kind: "signIn" } | { kind: "retry" } | { kind: "message"; text: string };

/**
 * unauthorized goes to sign-in. A failed AI call, or no answer at all, gets the
 * general error and "Subukan ulit". Any other error shows its own message.
 */
export function problemFor(error: unknown): Problem {
  if (!(error instanceof ApiFailure) || error.code === null || error.code === "ai_failed") return { kind: "retry" };
  if (error.code === "unauthorized") return { kind: "signIn" };
  return { kind: "message", text: error.message };
}

export type CopyResult = { ok: true } | { ok: false; failed: "missingPrice" | "clipboard" };

/**
 * "Kopyahin": the clipboard first, so a refused clipboard never changes the quote;
 * then the apply route with the edited message and the draft's newPrice and
 * validUntil exactly as the draft route answered them. A server failure throws.
 */
export async function copyThenApply(
  deps: {
    writeClipboard: (text: string) => Promise<void>;
    apply: (req: ApplyPriceUpdateRequest) => Promise<unknown>;
  },
  draft: Pick<PriceUpdateResponse, "newPrice" | "validUntil">,
  message: string,
): Promise<CopyResult> {
  if (!mentionsNewPrice(message, draft.newPrice)) return { ok: false, failed: "missingPrice" };
  try {
    await deps.writeClipboard(message);
  } catch {
    return { ok: false, failed: "clipboard" };
  }
  await deps.apply({ message, newPrice: draft.newPrice, validUntil: draft.validUntil });
  return { ok: true };
}
