// Request bodies for the shop, stem and quote routes: only the fields named in the
// lib/contract.ts request types get through, and each is checked.

import { describe, expect, test } from "vitest";
import type { Stem } from "../types";
import { parseNewStem, parseQuoteUpdate, parseShopUpdate, parseStemUpdate } from "./fields";

describe("parseShopUpdate", () => {
  test("keeps the shop settings and drops every other field", () => {
    const body = { markupPercent: 60, wrapFee: 50, id: "other-shop", ownerId: "someone", createdAt: "2026-01-01", price: 1 };
    expect(parseShopUpdate(body)).toEqual({ ok: true, value: { markupPercent: 60, wrapFee: 50 } });
  });

  test("trims the shop name", () => {
    expect(parseShopUpdate({ name: "  Bulaklak ni Rosa " })).toEqual({ ok: true, value: { name: "Bulaklak ni Rosa" } });
  });

  test("accepts the edges of each range", () => {
    const body = { wrapFee: 0, laborFee: 0, markupPercent: 0, minimumMarginPercent: 100, validForDays: 60 };
    expect(parseShopUpdate(body)).toEqual({ ok: true, value: body });
  });

  test.each([
    ["a fee below zero", { wrapFee: -1 }],
    ["a fee as text", { laborFee: "50" }],
    ["a fee that is not a number", { wrapFee: Number.NaN }],
    ["a fee too big for the database", { wrapFee: 100_000_000 }],
    ["a negative markup", { markupPercent: -5 }],
    ["a minimum margin over 100", { minimumMarginPercent: 101 }],
    ["zero valid-for days", { validForDays: 0 }],
    ["more than 60 valid-for days", { validForDays: 61 }],
    ["part of a day", { validForDays: 1.5 }],
    ["a name that is not text", { name: 5 }],
    ["a null setting", { markupPercent: null }],
  ])("refuses %s with invalid_request", (_case, body) => {
    expect(parseShopUpdate(body)).toMatchObject({ ok: false, code: "invalid_request" });
  });

  test("refuses a body that is not an object", () => {
    expect(parseShopUpdate([1, 2])).toMatchObject({ ok: false, code: "invalid_request" });
  });
});

const peony = { flower: "Peony", color: "pink", isFiller: false, unit: "piece", bundleSize: null, samplePrice: 250 };

describe("parseNewStem", () => {
  test("keeps the new row's fields, trimmed, and drops every other field", () => {
    const body = { ...peony, flower: " Peony ", color: "pink ", id: "x", shopId: "other-shop", hidden: true, sampleSource: "x", latestCost: 1 };
    expect(parseNewStem(body)).toEqual({ ok: true, value: peony });
  });

  test("keeps the bundle size of a bundle row", () => {
    const mums = { ...peony, flower: "Mums", unit: "bundle", bundleSize: 10 };
    expect(parseNewStem(mums)).toEqual({ ok: true, value: mums });
  });

  test("clears the bundle size when the unit is not bundle", () => {
    expect(parseNewStem({ ...peony, bundleSize: 10 })).toEqual({ ok: true, value: peony });
  });

  test.each([null, 0, -10])("refuses a bundle row with bundle size %s with invalid_bundle_size", (bundleSize) => {
    expect(parseNewStem({ ...peony, unit: "bundle", bundleSize })).toMatchObject({ ok: false, code: "invalid_bundle_size" });
  });

  test.each([
    ["a missing field", { flower: "Peony", color: "pink", isFiller: false, unit: "piece", bundleSize: null }],
    ["an empty flower name", { ...peony, flower: "  " }],
    ["an unknown unit", { ...peony, unit: "box" }],
    ["isFiller as text", { ...peony, isFiller: "no" }],
    ["a negative sample price", { ...peony, samplePrice: -1 }],
    ["part of a stem in a bundle", { ...peony, unit: "bundle", bundleSize: 1.5 }],
    ["a bundle size as text", { ...peony, unit: "bundle", bundleSize: "10" }],
  ])("refuses %s with invalid_request", (_case, body) => {
    expect(parseNewStem(body)).toMatchObject({ ok: false, code: "invalid_request" });
  });
});

const roseRed: Stem = {
  id: "5e000000-0000-4000-8000-000000000001", shopId: "a0000000-0000-4000-8000-000000000001",
  flower: "Rose", color: "red", isFiller: false, unit: "dozen", bundleSize: null,
  samplePrice: 250, sampleSource: "Placeholder", hidden: false,
};
const mumsWhite: Stem = { ...roseRed, flower: "Chrysanthemum", color: "white", unit: "bundle", bundleSize: 10, samplePrice: 150 };

describe("parseStemUpdate", () => {
  test("keeps the editable fields and drops every other field", () => {
    const body = { samplePrice: 270, hidden: true, color: " dark red ", id: "x", shopId: "other-shop", sampleSource: "x" };
    expect(parseStemUpdate(body, roseRed)).toEqual({ ok: true, value: { samplePrice: 270, hidden: true, color: "dark red" } });
  });

  test("leaves a bundle row's size alone when another field changes", () => {
    expect(parseStemUpdate({ samplePrice: 160 }, mumsWhite)).toEqual({ ok: true, value: { samplePrice: 160 } });
  });

  test("turns a row into a bundle row when a bundle size comes with it", () => {
    expect(parseStemUpdate({ unit: "bundle", bundleSize: 20 }, roseRed)).toEqual({ ok: true, value: { unit: "bundle", bundleSize: 20 } });
  });

  test("clears the bundle size when a bundle row changes to another unit", () => {
    expect(parseStemUpdate({ unit: "piece" }, mumsWhite)).toEqual({ ok: true, value: { unit: "piece", bundleSize: null } });
  });

  test.each([
    ["a row changed to bundle without a size", { unit: "bundle" }, roseRed],
    ["a row changed to bundle with size 0", { unit: "bundle", bundleSize: 0 }, roseRed],
    ["a bundle row whose size is cleared", { bundleSize: null }, mumsWhite],
  ])("refuses %s with invalid_bundle_size", (_case, body, current) => {
    expect(parseStemUpdate(body, current)).toMatchObject({ ok: false, code: "invalid_bundle_size" });
  });

  test.each([
    ["hidden as text", { hidden: "yes" }],
    ["an empty flower name", { flower: "" }],
  ])("refuses %s with invalid_request", (_case, body) => {
    expect(parseStemUpdate(body, roseRed)).toMatchObject({ ok: false, code: "invalid_request" });
  });
});

describe("parseQuoteUpdate", () => {
  test("keeps the label, budget, valid-until date and reply text, and drops every other field", () => {
    const body = { label: " Debut, Oct 25 ", budget: 1500, validUntil: "2026-10-26", replyText: "Hi po!", status: "sent", price: 1, shopId: "x" };
    expect(parseQuoteUpdate(body)).toEqual({
      ok: true,
      value: { label: "Debut, Oct 25", budget: 1500, validUntil: "2026-10-26", replyText: "Hi po!" },
    });
  });

  test("clears the budget with null", () => {
    expect(parseQuoteUpdate({ budget: null })).toEqual({ ok: true, value: { budget: null } });
  });

  test.each([
    ["an empty label", { label: "   " }],
    ["a label over 80 characters", { label: "x".repeat(81) }],
    ["a negative budget", { budget: -1 }],
    ["a date that is not YYYY-MM-DD", { validUntil: "Oct 26" }],
    ["a date that does not exist", { validUntil: "2026-02-30" }],
    ["a cleared valid-until date", { validUntil: null }],
    ["reply text that is not text", { replyText: 5 }],
  ])("refuses %s with invalid_request", (_case, body) => {
    expect(parseQuoteUpdate(body)).toMatchObject({ ok: false, code: "invalid_request" });
  });
});
