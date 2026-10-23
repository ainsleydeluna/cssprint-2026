import { describe, expect, it } from "vitest";
import { ApiFailure } from "@/app/(app)/_components/api";
import { copyMessage, leadButton, mentionsNewPrice, problemFor, saveDraft, wholePesos } from "./price-update";

describe("problemFor", () => {
  it("sends a signed-out florist to sign-in", () => {
    expect(problemFor(new ApiFailure("unauthorized", "Not signed in"))).toBe("signIn");
  });

  it("offers a retry when the AI call failed, or there was no answer at all", () => {
    expect(problemFor(new ApiFailure("ai_failed", "Drafting the price update failed: timeout"))).toBe("retry");
    expect(problemFor(new ApiFailure(null, "Network error"))).toBe("retry");
    expect(problemFor(new TypeError("boom"))).toBe("retry");
  });

  it("asks to open the quote again when the server refuses the request", () => {
    // Expired quote, flag already cleared, or the valid-until date has passed.
    expect(problemFor(new ApiFailure("invalid_request", "Only an open, underwater quote gets a price update"))).toBe("openAgain");
  });

  it("gives not_found, rate_limited and any other code their own line, never the server's text", () => {
    expect(problemFor(new ApiFailure("not_found", "Quote not found"))).toBe("notFound");
    expect(problemFor(new ApiFailure("rate_limited", "Too many"))).toBe("rateLimited");
    expect(problemFor(new ApiFailure("incomplete_quote", "Quote has a blank count"))).toBe("other");
  });
});

describe("wholePesos", () => {
  it("shows whole pesos with a thousands comma", () => {
    expect(wholePesos(1220)).toBe("₱1,220");
    expect(wholePesos(990)).toBe("₱990");
    expect(wholePesos(12500)).toBe("₱12,500");
  });
});

describe("mentionsNewPrice", () => {
  it("accepts a message that still says the new price the way the AI draft wrote it", () => {
    expect(mentionsNewPrice("Hi po! Ang bagong presyo ay ₱1,220, valid hanggang Oct 30.", 1220)).toBe(true);
  });

  it("refuses a message whose price was deleted or changed, which the server would refuse too", () => {
    expect(mentionsNewPrice("Hi po! Valid hanggang Oct 30.", 1220)).toBe(false);
    expect(mentionsNewPrice("Hi po! Ang bagong presyo ay ₱1,200.", 1220)).toBe(false);
    expect(mentionsNewPrice("Hi po! Ang bagong presyo ay 1220 pesos.", 1220)).toBe(false);
  });
});

describe("saveDraft", () => {
  const draft = { message: "Hi po! Bagong presyo: ₱1,220, valid hanggang Oct 30.", oldPrice: 1100, newPrice: 1220, validUntil: "2026-10-30", demo: false };
  const quote = { id: "q1", underwaterAt: null };

  it("saves the edited message with the draft's price and date, and hands back the saved quote", async () => {
    const sent: unknown[] = [];
    const edited = "Hello po! ₱1,220 na po, valid hanggang Oct 30.";
    const result = await saveDraft(async (req) => (sent.push(req), quote), draft, edited);
    expect(result).toEqual({ ok: true, saved: quote });
    expect(sent).toEqual([{ message: edited, newPrice: 1220, validUntil: "2026-10-30" }]);
  });

  it("does not save a message missing the new price", async () => {
    let saved = false;
    const result = await saveDraft(async () => ((saved = true), quote), draft, "Hi po! Nagbago ang presyo.");
    expect(result).toEqual({ ok: false, failed: "missingPrice" });
    expect(saved).toBe(false);
  });

  it("passes a server refusal on to the screen", async () => {
    const failure = new ApiFailure("invalid_request", "validUntil is before today in Manila");
    await expect(saveDraft(() => Promise.reject(failure), draft, draft.message)).rejects.toBe(failure);
  });
});

describe("copyMessage", () => {
  it("copies the text and says so", async () => {
    let copied = "";
    expect(await copyMessage(async (text) => void (copied = text), "Hi po! ₱1,220")).toBe(true);
    expect(copied).toBe("Hi po! ₱1,220");
  });

  it("says so when the phone refuses the clipboard", async () => {
    expect(await copyMessage(() => Promise.reject(new Error("denied")), "Hi po!")).toBe(false);
  });
});

describe("leadButton after saving", () => {
  it("leads with Kopyahin right after a clean save", () => {
    expect(leadButton({ stillUnderwater: false, copied: false })).toBe("copy");
  });

  it("leads with going back once the message is copied", () => {
    expect(leadButton({ stillUnderwater: false, copied: true })).toBe("back");
  });

  it("leads with going back when the saved price is still too low, so sending it is not the nudge", () => {
    expect(leadButton({ stillUnderwater: true, copied: false })).toBe("back");
  });
});
