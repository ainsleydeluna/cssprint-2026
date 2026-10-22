// Fake response bodies, one per route, typed against lib/contract.ts.
// Built from the rows in ./data.ts.

import type {
  AccuracyResponse,
  BudgetOptionsResponse,
  CreateQuoteResponse,
  DraftReplyResponse,
  ExtractReceiptResponse,
  PriceUpdateResponse,
  QuoteDetail,
  QuoteListResponse,
  ReceiptListResponse,
  SaveReceiptResponse,
  StemListResponse,
  UpdateQuoteLinesRequest,
  UploadPhotoResponse,
} from "../contract";
import { price, recipeCost } from "../money";
import { batches, quotes, receipts, shop, stemIds as s, stems } from "./data";

export { shop, stems };

export function findQuote(id: string) {
  return quotes.find((detail) => detail.quote.id === id);
}

export const uploadPhoto = {
  photoPath: `${shop.id}/f0000000-0000-4000-8000-000000000099.jpg`,
} satisfies UploadPhotoResponse;

export const stemList = { stems } satisfies StemListResponse;

export const extractReceipt = {
  purchaseDate: "2026-10-22",
  lines: [
    { rawText: "2 dz red rose @270 = 540", stemId: s.roseRed, quantity: 2, unit: "dozen", bundleSize: null, unitPrice: 270, totalPaid: 540, costPerStem: 22.5, confidence: "high", note: "" },
    { rawText: "1 bndl astro 150", stemId: s.alstroemeria, quantity: 1, unit: "bundle", bundleSize: 10, unitPrice: 150, totalPaid: 150, costPerStem: 15, confidence: "medium", note: "Bundle size not written; assumed 10" },
    { rawText: "3 bb breath @80", stemId: s.babysBreath, quantity: 3, unit: "bunch", bundleSize: null, unitPrice: 80, totalPaid: 240, costPerStem: 80, confidence: "medium", note: "No total written; computed from @80" },
    { rawText: "2 pc ???? 90", stemId: null, quantity: 2, unit: "piece", bundleSize: null, unitPrice: null, totalPaid: 90, costPerStem: 45, confidence: "low", note: "Could not read the flower name" },
  ],
  note: "",
  demo: false,
} satisfies ExtractReceiptResponse;

const [receipt2, receipt1] = receipts;
const batchesOf = (receiptId: string) => batches.filter((batch) => batch.receiptId === receiptId);

export const saveReceipt = {
  receipt: receipt2,
  batches: batchesOf(receipt2.id),
  underwaterQuoteIds: quotes.filter((detail) => detail.quote.underwaterAt !== null).map((detail) => detail.quote.id),
} satisfies SaveReceiptResponse;

export const receiptList = {
  receipts: [receipt2, receipt1].map((receipt) => ({ receipt, batches: batchesOf(receipt.id) })),
} satisfies ReceiptListResponse;

export const quoteList = {
  quotes: [
    { ...quotes[0].quote, timeToQuoteSeconds: null },
    { ...quotes[1].quote, timeToQuoteSeconds: 210 },
    { ...quotes[2].quote, timeToQuoteSeconds: 240 },
    { ...quotes[3].quote, timeToQuoteSeconds: 360 },
  ],
  averageTimeToQuoteSeconds: 270,
} satisfies QuoteListResponse;

/** The draft (Inquiry 3), as a new quote from a photo. */
export const createQuote = { ...quotes[0], demo: false } satisfies CreateQuoteResponse;

export const draftReply = {
  message:
    "Hi po! Para sa bouquet na ito: 3 pink stargazer, 8 alstroemeria, white roses, 5 carnations at baby's breath. ₱1,220 po, valid hanggang Oct 24. Salamat po!",
  demo: false,
} satisfies DraftReplyResponse;

/** For Inquiry 3 with its ₱1,000 budget. */
export const budgetOptions = {
  options: [
    {
      label: "Fewer stargazers and white roses",
      lines: [
        { stemId: s.stargazerPink, count: 2, costPerStem: 150, note: "" },
        { stemId: s.alstroemeria, count: 8, costPerStem: 15, note: "" },
        { stemId: s.roseWhite, count: 3, costPerStem: 16.67, note: "" },
        { stemId: s.babysBreath, count: 1, costPerStem: 80, note: "" },
      ],
      recipeCost: 550.01,
      price: 980,
      margin: 0.4388,
      overBudgetBy: 0,
    },
    {
      label: "Carnations instead of white roses",
      lines: [
        { stemId: s.stargazerPink, count: 2, costPerStem: 150, note: "" },
        { stemId: s.alstroemeria, count: 6, costPerStem: 15, note: "" },
        { stemId: s.carnationRed, count: 8, costPerStem: 12, note: "Same red as the ranunculus" },
        { stemId: s.babysBreath, count: 1, costPerStem: 80, note: "" },
      ],
      recipeCost: 566,
      price: 1000,
      margin: 0.434,
      overBudgetBy: 0,
    },
  ],
  demo: false,
} satisfies BudgetOptionsResponse;

/** For Inquiry 2, underwater since receipt 2 raised red roses to ₱22.50. */
export const priceUpdate = {
  message:
    "Hi po! Pasensya na po, tumaas ang presyo ng roses sa Dangwa. Ang bagong presyo ng bouquet ay ₱1,370 po, valid hanggang Oct 24. Salamat po!",
  oldPrice: 960,
  newPrice: 1370,
  validUntil: "2026-10-24",
  demo: false,
} satisfies PriceUpdateResponse;

/** Placeholder numbers, not test results. */
export const accuracy = {
  eval: [
    { model: "claude-opus-5-5", photoPx: 1600, stemRowAccuracy: 0.93, countsWithin2: 0.85, totalsWithin10Percent: 0.8, receiptLineAccuracy: 0.96, medianSeconds: 9.5 },
    { model: "claude-sonnet-5-5", photoPx: 1600, stemRowAccuracy: 0.9, countsWithin2: 0.6, totalsWithin10Percent: 0.65, receiptLineAccuracy: 0.97, medianSeconds: 5.2 },
  ],
  live: [
    { call: "analyzeBouquet", calls: 12, medianSeconds: 9.8, averageCostUsd: 0.021 },
    { call: "extractReceipt", calls: 5, medianSeconds: 6.1, averageCostUsd: 0.008 },
    { call: "draftReply", calls: 9, medianSeconds: 2.4, averageCostUsd: 0.002 },
  ],
  averageCostPerQuoteUsd: 0.025,
} satisfies AccuracyResponse;

/** Stub for PUT /api/quotes/[id]/lines: reprices the sent lines at latest costs, as the real route will. */
export function repriceQuote(detail: QuoteDetail, request: UpdateQuoteLinesRequest): QuoteDetail {
  const lines = request.lines.map(({ id, ...line }) => ({
    ...line,
    id: id ?? crypto.randomUUID(),
    quoteId: detail.quote.id,
    shopId: shop.id,
    costPerStem: line.stemId ? (stems.find((stem) => stem.id === line.stemId)?.latestCost ?? 0) : 0,
  }));
  return { quote: { ...detail.quote, price: price(recipeCost(lines).cost, shop) }, lines };
}
