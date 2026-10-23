import { describe, expect, it, vi } from "vitest";
import { t } from "@/lib/strings";
import type { Quote } from "@/lib/types";
import { copyBlocker, copyReply, quoteLock, replyEdited, savesReplyText } from "./copy";

const line = (stemId: string | null, count: number | null) => ({ stemId, count });

describe("copyBlocker (same rule as the server's incomplete_quote)", () => {
  it("is null when every line has a flower and a count", () => {
    expect(copyBlocker([line("rose", 12), line("baby", 2)])).toBeNull();
  });
  it("blocks a quote with no lines", () => {
    expect(copyBlocker([])).toBe(t("quote", "noLines"));
  });
  it("names how many lines still need a flower or a count", () => {
    expect(copyBlocker([line(null, 1), line("rose", 12)])).toBe(t("quote", "needFlower", { n: 1 }));
    expect(copyBlocker([line("rose", null), line("baby", null)])).toBe(t("quote", "needCount", { n: 2 }));
    expect(copyBlocker([line(null, 1), line("rose", null)])).toBe(
      `${t("quote", "needFlower", { n: 1 })} ${t("quote", "needCount", { n: 1 })}`,
    );
  });
});

describe("copyReply", () => {
  const sent = { id: "q1", status: "sent" } as Quote;

  it("copies to the clipboard first, then tells the server", async () => {
    const order: string[] = [];
    const result = await copyReply("Hi po!", {
      writeClipboard: async (text) => void order.push(`clipboard:${text}`),
      markCopied: async (text) => (order.push(`server:${text}`), sent),
    });
    expect(order).toEqual(["clipboard:Hi po!", "server:Hi po!"]);
    expect(result).toEqual({ ok: true, quote: sent });
  });

  it("never marks the quote sent when the clipboard refuses", async () => {
    const markCopied = vi.fn(async () => sent);
    const result = await copyReply("Hi po!", {
      writeClipboard: async () => {
        throw new Error("NotAllowedError");
      },
      markCopied,
    });
    expect(markCopied).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, failed: "clipboard" });
  });

  it("reports a failed save with its error, after the text was copied", async () => {
    const error = new Error("incomplete_quote");
    const result = await copyReply("Hi po!", {
      writeClipboard: async () => {},
      markCopied: async () => {
        throw error;
      },
    });
    expect(result).toEqual({ ok: false, failed: "save", error });
  });
});

describe("replyEdited (ask before \"Gumawa ulit\" replaces the text)", () => {
  it("is false while the text is exactly what the server last gave", () => {
    expect(replyEdited("Hi po! ₱3,780", "Hi po! ₱3,780")).toBe(false);
    expect(replyEdited("", "")).toBe(false);
  });
  it("is true once the florist changed the text", () => {
    expect(replyEdited("Hi po! ₱3,780 lang", "Hi po! ₱3,780")).toBe(true);
    expect(replyEdited("", "Hi po!")).toBe(true);
  });
  it("is true for text typed after a failed draft left nothing", () => {
    expect(replyEdited("Hello po", "")).toBe(true);
  });
});

describe("quoteLock (what a sent quote's state blocks)", () => {
  const today = "2026-10-23";
  const q = (patch: Partial<Quote>) => ({ status: "sent", validUntil: "2026-10-25", underwaterAt: null, ...patch }) as Quote;

  it("blocks nothing on a draft or an open sent quote", () => {
    expect(quoteLock(q({ status: "draft", validUntil: null }), today)).toBeNull();
    expect(quoteLock(q({}), today)).toBeNull();
  });
  it("locks an underwater quote (Gumawa ulit and Copy off) until the price update", () => {
    expect(quoteLock(q({ underwaterAt: "2026-10-23T01:00:00Z" }), today)).toEqual({
      kind: "underwater",
      reason: t("quote", "underwaterBlock"),
    });
  });
  it("locks an expired quote, even one the page still shows as sent", () => {
    const expired = { kind: "expired", reason: t("quote", "expired") };
    expect(quoteLock(q({ status: "expired" }), today)).toEqual(expired);
    expect(quoteLock(q({ validUntil: "2026-10-22" }), today)).toEqual(expired);
    expect(quoteLock(q({ status: "expired", underwaterAt: "2026-10-20T01:00:00Z" }), today)).toEqual(expired);
  });
});

describe("savesReplyText (PATCH replyText only while a draft)", () => {
  it("saves a draft's edited text", () => {
    expect(savesReplyText({ status: "draft" })).toBe(true);
  });
  it("keeps a sent or expired quote's edits on screen only: its saved text is what the customer got", () => {
    expect(savesReplyText({ status: "sent" })).toBe(false);
    expect(savesReplyText({ status: "expired" })).toBe(false);
  });
});
