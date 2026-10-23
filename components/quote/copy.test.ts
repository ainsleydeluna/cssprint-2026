import { describe, expect, it, vi } from "vitest";
import { t } from "@/lib/strings";
import type { Quote } from "@/lib/types";
import { copyBlocker, copyReply, formatDuration } from "./copy";

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

describe("formatDuration (time-to-quote)", () => {
  it("shows seconds, minutes and hours in the largest two units", () => {
    expect(formatDuration(0)).toBe(t("quote", "seconds", { n: 0 }));
    expect(formatDuration(45)).toBe(t("quote", "seconds", { n: 45 }));
    expect(formatDuration(120)).toBe(t("quote", "minutes", { n: 2 }));
    expect(formatDuration(252)).toBe(`${t("quote", "minutes", { n: 4 })} ${t("quote", "seconds", { n: 12 })}`);
    expect(formatDuration(3900)).toBe(`${t("quote", "hours", { n: 1 })} ${t("quote", "minutes", { n: 5 })}`);
  });
});
