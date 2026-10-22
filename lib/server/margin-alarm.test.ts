import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import type { Quote, QuoteLine } from "../types";
import { recheckUnderwater, underwaterChanges } from "./margin-alarm";

const shop = { markupPercent: 60, wrapFee: 0, laborFee: 0, minimumMarginPercent: 20 };
const today = "2026-10-23";

type OpenQuote = Pick<Quote, "id" | "status" | "price" | "validUntil" | "underwaterAt">;
const quote = (id: string, overrides: Partial<OpenQuote> = {}): OpenQuote => ({
  id,
  status: "sent",
  price: 960,
  validUntil: "2026-10-25",
  underwaterAt: null,
  ...overrides,
});
const line = (quoteId: string, stemId: string | null, count: number | null): Pick<QuoteLine, "quoteId" | "stemId" | "count"> => ({
  quoteId,
  stemId,
  count,
});

/** 30 roses at ₱22.50 cost ₱675 against a ₱960 price: margin 29.7%. At ₱30 a stem: ₱900, margin 6.3%. */
function recheck(quotes: OpenQuote[], roseCost: number, changed = ["rose"]) {
  return underwaterChanges({
    quotes,
    lines: quotes.flatMap((q) => [line(q.id, "rose", 30), line(q.id, null, 3), line(q.id, "tulip", null)]),
    costs: new Map([["rose", roseCost]]),
    changedStemIds: new Set(changed),
    shop,
    today,
  });
}

describe("underwaterChanges", () => {
  test("flags an open quote whose margin at latest costs fell below the minimum", () => {
    expect(recheck([quote("q1")], 30)).toEqual({ flag: ["q1"], clear: [], underwater: ["q1"] });
  });

  test("clears the flag when the margin is back at or above the minimum", () => {
    expect(recheck([quote("q1", { underwaterAt: "2026-10-22T10:00:00Z" })], 22.5)).toEqual({
      flag: [],
      clear: ["q1"],
      underwater: [],
    });
  });

  test("counts a quote that was already flagged and is still underwater, without flagging it again", () => {
    expect(recheck([quote("q1", { underwaterAt: "2026-10-22T10:00:00Z" })], 30)).toEqual({
      flag: [],
      clear: [],
      underwater: ["q1"],
    });
  });

  test("leaves quotes alone when none of their stems changed cost", () => {
    expect(recheck([quote("q1")], 30, ["carnation"])).toEqual({ flag: [], clear: [], underwater: [] });
  });

  test("rechecks open quotes only: sent and valid until today or later", () => {
    const quotes = [
      quote("draft", { status: "draft", price: null, validUntil: null }),
      quote("expired", { status: "expired" }),
      quote("past", { validUntil: "2026-10-22" }),
      quote("today", { validUntil: today }),
    ];
    expect(recheck(quotes, 30).underwater).toEqual(["today"]);
  });
});

describe("recheckUnderwater", () => {
  test("does nothing, not even a read, when the margin alarm is off", async () => {
    const untouchable = new Proxy({}, { get: () => { throw new Error("database used"); } }) as SupabaseClient;

    await expect(recheckUnderwater(untouchable, shop, new Map([["rose", 22.5]]), { enabled: false })).resolves.toEqual([]);
  });

  test("logs a failed recheck and answers no ids, so a committed save or delete still succeeds", async () => {
    const failing = { from: () => { throw new Error("connection lost"); } } as unknown as SupabaseClient;

    await expect(recheckUnderwater(failing, shop, new Map([["rose", 22.5]]), { enabled: true })).resolves.toEqual([]);
  });
});
