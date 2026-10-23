import { describe, expect, it } from "vitest";
import type { QuoteListItem } from "@/lib/contract";
import { cleanLabel, showsUnderwater, underwaterCount, withoutQuote, withRenamed } from "./list";

const quote = (patch: Partial<QuoteListItem>) => ({ status: "sent", underwaterAt: null, ...patch }) as QuoteListItem;

describe("cleanLabel (rename)", () => {
  it("trims the new name", () => {
    expect(cleanLabel("  Debut, pink  ")).toBe("Debut, pink");
  });
  it("is null for a blank name, so Save stays off", () => {
    expect(cleanLabel("")).toBeNull();
    expect(cleanLabel("   ")).toBeNull();
  });
});

describe("underwaterCount (banner above the list)", () => {
  it("counts quotes with underwaterAt set", () => {
    const flagged = "2026-10-23T01:00:00Z";
    expect(underwaterCount([quote({}), quote({ underwaterAt: flagged }), quote({ underwaterAt: flagged })])).toBe(2);
  });
  it("leaves out expired quotes: the customer's price no longer holds", () => {
    expect(underwaterCount([quote({ status: "expired", underwaterAt: "2026-10-20T01:00:00Z" })])).toBe(0);
  });
  it("is 0 for no quotes", () => {
    expect(underwaterCount([])).toBe(0);
  });
});

describe("showsUnderwater (badge and banner)", () => {
  const flagged = "2026-10-23T01:00:00Z";
  it("shows on an open quote with underwaterAt set", () => {
    expect(showsUnderwater(quote({ underwaterAt: flagged }))).toBe(true);
    expect(showsUnderwater(quote({}))).toBe(false);
  });
  it("never shows on an expired quote: expired beats underwater, like the banner count", () => {
    const expired = quote({ status: "expired", underwaterAt: flagged });
    expect(showsUnderwater(expired)).toBe(false);
    expect(underwaterCount([expired])).toBe(0);
  });
});

describe("withRenamed and withoutQuote (built from the newest list)", () => {
  const a = { ...quote({}), id: "a", label: "Inquiry 1", timeToQuoteSeconds: 252 } as QuoteListItem;
  const b = { ...quote({}), id: "b", label: "Inquiry 2", timeToQuoteSeconds: null } as QuoteListItem;

  it("renames the matching quote and keeps its list-only fields", () => {
    const renamed = withRenamed([a, b], { ...a, label: "Debut, pink" });
    expect(renamed.map((q) => q.label)).toEqual(["Debut, pink", "Inquiry 2"]);
    expect(renamed[0].timeToQuoteSeconds).toBe(252);
  });
  it("removes a deleted quote", () => {
    expect(withoutQuote([a, b], "a").map((q) => q.id)).toEqual(["b"]);
  });
  it("can't bring back a deleted quote when its rename answers after the delete", () => {
    const afterDelete = withoutQuote([a, b], "a");
    expect(withRenamed(afterDelete, { ...a, label: "Debut, pink" }).map((q) => q.id)).toEqual(["b"]);
  });
});
