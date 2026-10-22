// Fake rows for the stub routes, until Ice's tickets replace each stub with the
// database. One consistent story so screens show real cases:
// - Receipt 1 (Oct 20) sets red roses at ₱15 a stem; receipt 2 (Oct 22) raises them to ₱22.50.
// - Inquiry 2 was priced at ₱15 roses, so receipt 2 turned it underwater.
// - Inquiry 3 is a draft with unsure lines, a blank count and a "pick a flower" line.
// lib/fake/fake.test.ts checks every price and cost here against lib/money.ts.

import type { QuoteDetail, StemWithCost } from "../contract";
import type { QuoteLine, Receipt, Shop, StockBatch } from "../types";

const uuid = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const shop = {
  id: uuid("a0", 1),
  ownerId: uuid("a0", 99),
  name: "Bulaklak ni Rosa",
  wrapFee: 50,
  laborFee: 100,
  markupPercent: 50,
  minimumMarginPercent: 20,
  validForDays: 2,
  createdAt: "2026-10-19T08:00:00Z",
} satisfies Shop;

const shopId = shop.id;
const source = "Fake data for screens";

export const stemIds = {
  roseRed: uuid("5e", 1),
  roseWhite: uuid("5e", 2),
  tulipPink: uuid("5e", 3),
  stargazerPink: uuid("5e", 4),
  alstroemeria: uuid("5e", 5),
  carnationRed: uuid("5e", 6),
  babysBreath: uuid("5e", 7),
  eucalyptus: uuid("5e", 8),
  sunflower: uuid("5e", 9),
};

const s = stemIds;

/** Latest costs as of after receipt 2. */
export const stems = [
  { id: s.roseRed, shopId, flower: "Rose", color: "red", name: "Rose - red", isFiller: false, unit: "dozen", bundleSize: null, samplePrice: 180, sampleSource: source, hidden: false, latestCost: 22.5, isSample: false },
  { id: s.roseWhite, shopId, flower: "Rose", color: "white", name: "Rose - white", isFiller: false, unit: "dozen", bundleSize: null, samplePrice: 200, sampleSource: source, hidden: false, latestCost: 16.67, isSample: true },
  { id: s.tulipPink, shopId, flower: "Tulip", color: "pink", name: "Tulip - pink", isFiller: false, unit: "piece", bundleSize: null, samplePrice: 120, sampleSource: source, hidden: false, latestCost: 120, isSample: true },
  { id: s.stargazerPink, shopId, flower: "Stargazer lily", color: "pink", name: "Stargazer lily - pink", isFiller: false, unit: "piece", bundleSize: null, samplePrice: 150, sampleSource: source, hidden: false, latestCost: 150, isSample: true },
  { id: s.alstroemeria, shopId, flower: "Alstroemeria", color: "mixed", name: "Alstroemeria - mixed", isFiller: false, unit: "bundle", bundleSize: 10, samplePrice: 160, sampleSource: source, hidden: false, latestCost: 15, isSample: false },
  { id: s.carnationRed, shopId, flower: "Carnation", color: "red", name: "Carnation - red", isFiller: false, unit: "per10", bundleSize: null, samplePrice: 120, sampleSource: source, hidden: false, latestCost: 12, isSample: true },
  { id: s.babysBreath, shopId, flower: "Baby's breath", color: "white", name: "Baby's breath - white", isFiller: true, unit: "bunch", bundleSize: null, samplePrice: 90, sampleSource: source, hidden: false, latestCost: 80, isSample: false },
  { id: s.eucalyptus, shopId, flower: "Eucalyptus", color: "green", name: "Eucalyptus - green", isFiller: true, unit: "bunch", bundleSize: null, samplePrice: 60, sampleSource: source, hidden: false, latestCost: 50, isSample: false },
  { id: s.sunflower, shopId, flower: "Sunflower", color: "yellow", name: "Sunflower - yellow", isFiller: false, unit: "piece", bundleSize: null, samplePrice: 60, sampleSource: source, hidden: true, latestCost: 60, isSample: true },
] satisfies StemWithCost[];

export const receipts = [
  { id: uuid("ec", 2), shopId, purchaseDate: "2026-10-22", photoPath: `${shopId}/${uuid("f0", 2)}.jpg`, createdAt: "2026-10-22T00:30:00Z" },
  { id: uuid("ec", 1), shopId, purchaseDate: "2026-10-20", photoPath: `${shopId}/${uuid("f0", 1)}.jpg`, createdAt: "2026-10-20T01:00:00Z" },
] satisfies Receipt[];

const [receipt2, receipt1] = receipts;

export const batches = [
  { id: uuid("ba", 1), receiptId: receipt1.id, shopId, stemId: s.roseRed, quantity: 2, unit: "dozen", bundleSize: null, totalPaid: 360, costPerStem: 15, createdAt: receipt1.createdAt },
  { id: uuid("ba", 2), receiptId: receipt1.id, shopId, stemId: s.eucalyptus, quantity: 2, unit: "bunch", bundleSize: null, totalPaid: 100, costPerStem: 50, createdAt: receipt1.createdAt },
  { id: uuid("ba", 3), receiptId: receipt2.id, shopId, stemId: s.roseRed, quantity: 2, unit: "dozen", bundleSize: null, totalPaid: 540, costPerStem: 22.5, createdAt: receipt2.createdAt },
  { id: uuid("ba", 4), receiptId: receipt2.id, shopId, stemId: s.alstroemeria, quantity: 1, unit: "bundle", bundleSize: 10, totalPaid: 150, costPerStem: 15, createdAt: receipt2.createdAt },
  { id: uuid("ba", 5), receiptId: receipt2.id, shopId, stemId: s.babysBreath, quantity: 3, unit: "bunch", bundleSize: null, totalPaid: 240, costPerStem: 80, createdAt: receipt2.createdAt },
] satisfies StockBatch[];

const q = { inquiry1: uuid("90", 1), inquiry2: uuid("90", 2), inquiry3: uuid("90", 3), inquiry4: uuid("90", 4) };
let lineNumber = 0;
const line = (quoteId: string, fields: Omit<QuoteLine, "id" | "quoteId" | "shopId">): QuoteLine => ({
  id: uuid("11", ++lineNumber),
  quoteId,
  shopId,
  ...fields,
});

/** Newest first, as GET /api/quotes returns them. */
export const quotes: QuoteDetail[] = [
  {
    quote: {
      id: q.inquiry3, shopId, label: "Inquiry 3", status: "draft", photoPath: `${shopId}/${uuid("f0", 13)}.jpg`,
      budget: 1000, price: 1220, replyText: "", validUntil: null, underwaterAt: null,
      createdAt: "2026-10-22T03:00:00Z", sentAt: null,
    },
    lines: [
      line(q.inquiry3, { stemId: s.stargazerPink, count: 3, countLow: 3, countHigh: 4, confidence: "high", note: "", costPerStem: 150 }),
      line(q.inquiry3, { stemId: s.alstroemeria, count: 8, countLow: 6, countHigh: 10, confidence: "medium", note: "Clusters; counted stems", costPerStem: 15 }),
      line(q.inquiry3, { stemId: s.roseWhite, count: null, countLow: 10, countHigh: 14, confidence: "low", note: "Partly hidden at the back", costPerStem: 16.67 }),
      line(q.inquiry3, { stemId: s.carnationRed, count: 5, countLow: 4, countHigh: 6, confidence: "low", note: "Ranunculus, not on your list; priced as Carnation - red", costPerStem: 12 }),
      line(q.inquiry3, { stemId: null, count: 2, countLow: 1, countHigh: 3, confidence: "low", note: "Peony, not on your list", costPerStem: 0 }),
      line(q.inquiry3, { stemId: s.babysBreath, count: 1, countLow: 1, countHigh: 2, confidence: "high", note: "", costPerStem: 80 }),
    ],
  },
  {
    quote: {
      id: q.inquiry2, shopId, label: "Inquiry 2", status: "sent", photoPath: `${shopId}/${uuid("f0", 12)}.jpg`,
      budget: null, price: 960,
      replyText: "Hi po! 3 dozen red roses po ito. ₱960 po, valid hanggang Oct 23. Salamat po!",
      validUntil: "2026-10-23", underwaterAt: "2026-10-22T00:30:05Z",
      createdAt: "2026-10-21T05:00:00Z", sentAt: "2026-10-21T05:03:30Z",
    },
    lines: [
      line(q.inquiry2, { stemId: s.roseRed, count: 36, countLow: 34, countHigh: 38, confidence: "high", note: "", costPerStem: 15 }),
    ],
  },
  {
    quote: {
      id: q.inquiry1, shopId, label: "Debut, Oct 25", status: "sent", photoPath: `${shopId}/${uuid("f0", 11)}.jpg`,
      budget: 600, price: 570,
      replyText: "Hi po! Isang dozen red roses na may eucalyptus. ₱570 po, valid hanggang Oct 23. Salamat po!",
      validUntil: "2026-10-23", underwaterAt: null,
      createdAt: "2026-10-21T02:00:00Z", sentAt: "2026-10-21T02:04:00Z",
    },
    lines: [
      line(q.inquiry1, { stemId: s.roseRed, count: 12, countLow: 11, countHigh: 13, confidence: "high", note: "", costPerStem: 15 }),
      line(q.inquiry1, { stemId: s.eucalyptus, count: 2, countLow: 1, countHigh: 2, confidence: "medium", note: "", costPerStem: 50 }),
    ],
  },
  {
    quote: {
      id: q.inquiry4, shopId, label: "Inquiry 4", status: "expired", photoPath: `${shopId}/${uuid("f0", 14)}.jpg`,
      budget: null, price: 1950,
      replyText: "Hi po! 10 pink tulips po ito. ₱1,950 po, valid hanggang Oct 20. Salamat po!",
      validUntil: "2026-10-20", underwaterAt: null,
      createdAt: "2026-10-18T02:00:00Z", sentAt: "2026-10-18T02:06:00Z",
    },
    lines: [
      line(q.inquiry4, { stemId: s.tulipPink, count: 10, countLow: 9, countHigh: 11, confidence: "high", note: "", costPerStem: 120 }),
    ],
  },
];
