import { describe, expect, it } from "vitest";
import { ApiFailure } from "@/app/(app)/_components/api";
import { copyThenApply, mentionsNewPrice, problemFor, wholePesos } from "./price-update";

describe("problemFor", () => {
  it("sends a signed-out florist to sign-in", () => {
    expect(problemFor(new ApiFailure("unauthorized", "Not signed in"))).toEqual({ kind: "signIn" });
  });

  it("offers a retry when the AI call failed", () => {
    expect(problemFor(new ApiFailure("ai_failed", "Drafting the price update failed: timeout"))).toEqual({ kind: "retry" });
  });

  it("offers a retry when there was no answer at all (offline, server crash)", () => {
    expect(problemFor(new ApiFailure(null, "Network error"))).toEqual({ kind: "retry" });
    expect(problemFor(new TypeError("boom"))).toEqual({ kind: "retry" });
  });

  it("shows any other error's own message", () => {
    expect(problemFor(new ApiFailure("invalid_request", "Only an open, underwater quote gets a price update"))).toEqual({
      kind: "message",
      text: "Only an open, underwater quote gets a price update",
    });
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

describe("copyThenApply", () => {
  const draft = { message: "Hi po! Bagong presyo: ₱1,220, valid hanggang Oct 30.", oldPrice: 1100, newPrice: 1220, validUntil: "2026-10-30", demo: false };

  it("copies to the clipboard first, then saves the edited message with the draft's price and date", async () => {
    const order: string[] = [];
    const saved: unknown[] = [];
    const edited = "Hello po! ₱1,220 na po, valid hanggang Oct 30.";
    const result = await copyThenApply(
      {
        writeClipboard: async (text) => void order.push(`clipboard:${text}`),
        apply: async (req) => {
          order.push("server");
          saved.push(req);
        },
      },
      draft,
      edited,
    );
    expect(result).toEqual({ ok: true });
    expect(order).toEqual([`clipboard:${edited}`, "server"]);
    expect(saved).toEqual([{ message: edited, newPrice: 1220, validUntil: "2026-10-30" }]);
  });

  it("saves nothing when the clipboard refuses", async () => {
    let applied = false;
    const result = await copyThenApply(
      { writeClipboard: () => Promise.reject(new Error("denied")), apply: async () => void (applied = true) },
      draft,
      draft.message,
    );
    expect(result).toEqual({ ok: false, failed: "clipboard" });
    expect(applied).toBe(false);
  });

  it("neither copies nor saves a message missing the new price", async () => {
    const calls: string[] = [];
    const result = await copyThenApply(
      { writeClipboard: async () => void calls.push("clipboard"), apply: async () => void calls.push("server") },
      draft,
      "Hi po! Nagbago ang presyo.",
    );
    expect(result).toEqual({ ok: false, failed: "missingPrice" });
    expect(calls).toEqual([]);
  });

  it("passes a server failure on to the screen", async () => {
    const failure = new ApiFailure("invalid_request", "validUntil is before today in Manila");
    await expect(
      copyThenApply({ writeClipboard: async () => {}, apply: () => Promise.reject(failure) }, draft, draft.message),
    ).rejects.toBe(failure);
  });
});
