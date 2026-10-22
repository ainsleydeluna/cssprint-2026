// Pricing rules for fit to budget and the price update (docs/spec.md section 4,
// "Fit to budget" and "Margin alarm").
//
// The shop marks up 50% and charges ₱50 + ₱100 in fees, minimum margin 20%.
// Latest costs: Rose - red ₱20.83 a stem, Carnation - pink ₱15, Baby's breath ₱100 a bunch.
// "Fewer roses": 6 × 20.83 + 6 × 15 + 1 × 100 = 314.98; × 1.5 + 150 = 622.47, rounded up to ₱630.
// "Same roses, fewer carnations": 12 × 20.83 + 3 × 15 + 2 × 100 = 494.96; × 1.5 + 150 = 892.44 → ₱900.

import { describe, expect, test } from "vitest";
import { priceBudgetOptions, priceUpdateChanges, priceUpdateTerms } from "./price-rules";

const shop = { markupPercent: 50, wrapFee: 50, laborFee: 100, minimumMarginPercent: 20 };
const stems = [
  { id: "rose", name: "Rose - red", latestCost: 20.83 },
  { id: "carnation", name: "Carnation - pink", latestCost: 15 },
  { id: "babys-breath", name: "Baby's breath - white", latestCost: 100 },
];

const fewerRoses = {
  label: "Fewer roses",
  lines: [
    { stem: "Rose - red", count: 6, note: "" },
    { stem: "Carnation - pink", count: 6, note: "" },
    { stem: "Baby's breath - white", count: 1, note: "One bunch" },
  ],
};
const fewerCarnations = {
  label: "Same roses, fewer carnations",
  lines: [
    { stem: "Rose - red", count: 12, note: "" },
    { stem: "Carnation - pink", count: 3, note: "" },
    { stem: "Baby's breath - white", count: 2, note: "" },
  ],
};

describe("priceBudgetOptions", () => {
  test("prices an option at latest costs and keeps it when it fits the budget and the minimum margin", () => {
    expect(priceBudgetOptions([fewerRoses], stems, shop, 700)).toEqual([
      {
        label: "Fewer roses",
        lines: [
          { stemId: "rose", count: 6, costPerStem: 20.83, note: "" },
          { stemId: "carnation", count: 6, costPerStem: 15, note: "" },
          { stemId: "babys-breath", count: 1, costPerStem: 100, note: "One bunch" },
        ],
        recipeCost: 314.98,
        price: 630,
        margin: (630 - 314.98) / 630,
        overBudgetBy: 0,
      },
    ]);
  });

  test("drops an option priced over the budget", () => {
    const kept = priceBudgetOptions([fewerCarnations, fewerRoses], stems, shop, 700);
    expect(kept.map((option) => option.label)).toEqual(["Fewer roses"]);
  });

  test("drops an option below the shop's minimum margin, even within budget", () => {
    // ₱900 at recipe cost ₱494.96 keeps 45%; ₱630 at ₱314.98 keeps 50%.
    const kept = priceBudgetOptions([fewerCarnations, fewerRoses], stems, { ...shop, minimumMarginPercent: 48 }, 1000);
    expect(kept.map((option) => option.label)).toEqual(["Fewer roses"]);
  });

  test("when none fit, answers only the cheapest option, over budget by its price minus the budget", () => {
    const shown = priceBudgetOptions([fewerCarnations, fewerRoses], stems, shop, 500);
    expect(shown.map(({ label, price, overBudgetBy }) => ({ label, price, overBudgetBy }))).toEqual([
      { label: "Fewer roses", price: 630, overBudgetBy: 130 },
    ]);
  });

  test("when none fit only because of the margin, the cheapest is shown with overBudgetBy 0", () => {
    const shown = priceBudgetOptions([fewerRoses], stems, { ...shop, minimumMarginPercent: 60 }, 700);
    expect(shown.map(({ label, overBudgetBy }) => ({ label, overBudgetBy }))).toEqual([{ label: "Fewer roses", overBudgetBy: 0 }]);
  });

  test("drops an option naming a row the shop does not have, rather than failing", () => {
    const peony = { label: "Peonies instead", lines: [{ stem: "Peony - pink", count: 3, note: "" }] };
    const kept = priceBudgetOptions([peony, fewerRoses], stems, shop, 700);
    expect(kept.map((option) => option.label)).toEqual(["Fewer roses"]);
  });

  test("answers no options when fitToBudget suggested none", () => {
    expect(priceBudgetOptions([], stems, shop, 500)).toEqual([]);
  });
});

// A sent quote priced ₱960 for 12 roses, 6 carnations and 2 bunches of baby's breath.
// A receipt raised roses to ₱30 a stem: 12 × 30 + 6 × 15 + 2 × 100 = 650; × 1.5 + 150 = 1,125 → ₱1,130.
const flagged = { status: "sent", price: 960, underwaterAt: "2026-10-23T01:00:00Z" } as const;
const recipe = [
  { stemId: "rose", count: 12 },
  { stemId: "carnation", count: 6 },
  { stemId: "babys-breath", count: 2 },
];
const latest = new Map([["rose", 30], ["carnation", 15], ["babys-breath", 100]]);
const termsShop = { ...shop, validForDays: 2 };
/** 10 AM on Oct 23 in Manila. */
const now = new Date("2026-10-23T02:00:00Z");

describe("priceUpdateTerms", () => {
  test("an underwater quote's new price is the same formula at latest costs, valid for the shop's days from today", () => {
    expect(priceUpdateTerms(flagged, recipe, latest, termsShop, now)).toEqual({
      ok: true,
      oldPrice: 960,
      newPrice: 1130,
      validUntil: "2026-10-25",
    });
  });

  test.each([
    ["a draft", { ...flagged, status: "draft" }],
    ["an expired quote", { ...flagged, status: "expired" }],
    ["a quote that is not underwater", { ...flagged, underwaterAt: null }],
  ] as const)("refuses %s", (_case, quote) => {
    expect(priceUpdateTerms(quote, recipe, latest, termsShop, now)).toEqual({ ok: false });
  });
});

// The draft as the price-update route answered it and the florist copied it.
const draft = { message: "Pasensya na po, ₱1,130 na po ito, valid until Oct 25.", newPrice: 1130, validUntil: "2026-10-25" };
const sentQuote = { ...flagged, validUntil: "2026-10-24", replyText: "Hi po!" };

describe("priceUpdateChanges", () => {
  test("saves the draft's price, valid-until and message, and clears the flag when the new price keeps the minimum margin", () => {
    // ₱1,130 at recipe cost ₱650 keeps 42%.
    expect(priceUpdateChanges(sentQuote, recipe, latest, shop, draft, now)).toEqual({
      ok: true,
      changes: { price: 1130, validUntil: "2026-10-25", replyText: draft.message, underwaterAt: null },
    });
  });

  test("keeps the flag when the saved price is still below the minimum margin at latest costs", () => {
    // ₱800 at recipe cost ₱650 keeps 18.75%, below 20%.
    const low = { message: "Pasensya na po, ₱800 na po ito, valid until Oct 25.", newPrice: 800, validUntil: "2026-10-25" };
    expect(priceUpdateChanges(sentQuote, recipe, latest, shop, low, now)).toEqual({
      ok: true,
      changes: { price: 800, validUntil: "2026-10-25", replyText: low.message, underwaterAt: flagged.underwaterAt },
    });
  });

  test("leaves the sent time and status alone, so time-to-quote does not change", () => {
    const applied = priceUpdateChanges(sentQuote, recipe, latest, shop, draft, now);
    expect(applied.ok && Object.keys(applied.changes)).not.toContain("sentAt");
    expect(applied.ok && Object.keys(applied.changes)).not.toContain("status");
  });

  test("accepts a valid-until date of today in Manila", () => {
    expect(priceUpdateChanges(sentQuote, recipe, latest, shop, { ...draft, validUntil: "2026-10-23" }, now).ok).toBe(true);
  });

  test.each([
    ["a message without the new price", { ...draft, message: "Pasensya na po, ₱1,120 na po ito." }],
    ["a valid-until date before today in Manila", { ...draft, validUntil: "2026-10-22" }],
  ])("refuses %s", (_case, sent) => {
    expect(priceUpdateChanges(sentQuote, recipe, latest, shop, sent, now)).toMatchObject({ ok: false });
  });

  test.each([
    ["a draft", { ...sentQuote, status: "draft" }],
    ["an expired quote", { ...sentQuote, status: "expired" }],
    ["a quote that is not underwater", { ...sentQuote, underwaterAt: null }],
  ] as const)("refuses %s", (_case, quote) => {
    expect(priceUpdateChanges(quote, recipe, latest, shop, draft, now)).toMatchObject({ ok: false });
  });

  test("copying the same draft again after the flag cleared changes nothing", () => {
    const applied = { ...sentQuote, price: 1130, validUntil: "2026-10-25", replyText: draft.message, underwaterAt: null };
    expect(priceUpdateChanges(applied, recipe, latest, shop, draft, now)).toEqual({ ok: true, changes: {} });
  });
});
