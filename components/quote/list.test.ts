import { describe, expect, it } from "vitest";
import type { QuoteListItem } from "@/lib/contract";
import { cleanLabel, underwaterCount } from "./list";

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
