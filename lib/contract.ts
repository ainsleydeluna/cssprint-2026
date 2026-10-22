// AI answer formats (docs/spec.md section 6) and the request and response body
// of every route under app/api. Only Ice changes this file, and tells the team.

import type {
  AiCallName,
  Confidence,
  ManilaDate,
  Money,
  Quote,
  QuoteLine,
  Receipt,
  Shop,
  Stem,
  StockBatch,
  Unit,
} from "./types";

// ---------------------------------------------------------------------------
// AI answer formats. Every field is required; "" or null when it does not
// apply. The AI never returns money. Stem names come from allowedStems, the
// shop's visible row names ("Rose - red").

export type AnalyzeBouquetResult = {
  lines: Array<{
    /** A name from allowedStems, or "Other". */
    stem: string;
    /** The AI's own color words. */
    color: string;
    /** Stems, or bunches for fillers. */
    countLow: number;
    countHigh: number;
    confidence: Confidence;
    /** From allowedStems when stem is "Other". */
    closestStem: string | null;
    note: string;
  }>;
  note: string;
};

export type ExtractReceiptResult = {
  /** "YYYY-MM-DD" if readable. */
  purchaseDate: string | null;
  lines: Array<{
    rawText: string;
    /** A name from allowedStems if matched. */
    stem: string | null;
    /** In the unit written on the receipt. */
    quantity: number | null;
    /**
     * The unit written on the receipt ("20pc" is "piece"), not the stem's usual
     * unit: carnations bought "20pc @15" are 20 pieces at ₱15 a piece, though the
     * stem row is per10. null when the receipt does not say.
     */
    unit: Unit | null;
    bundleSize: number | null;
    /** As written, e.g. "@150", per one of `unit`. */
    unitPrice: number | null;
    /** As written; null when the receipt has no total. */
    totalPaid: number | null;
    confidence: Confidence;
    note: string;
  }>;
  note: string;
};

export type FitToBudgetResult = {
  /** 0 to 3. */
  options: Array<{
    label: string;
    lines: Array<{ stem: string; count: number; note: string }>;
  }>;
  note: string;
};

export type DraftReplyResult = { message: string; note: string };
export type PriceUpdateResult = { message: string; note: string };

// ---------------------------------------------------------------------------
// Routes. Every route answers JSON; failures answer ApiError with the status
// ERROR_STATUS gives its code. Responses built from an AI call carry
// `demo: true` when they come from saved demo answers, so screens can show the
// "Demo" label.

export type ApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "incomplete_quote"
  | "invalid_bundle_size"
  | "rate_limited";

/** Screens check `code`, which never changes; `error` is a short English message for logs. */
export type ApiError = { code: ApiErrorCode; error: string };

export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  /** Signed out, or the session expired: the screen sends the florist to sign-in. */
  unauthorized: 401,
  /** A field has the wrong type or is out of range. Unknown fields are ignored, not refused. */
  invalid_request: 400,
  not_found: 404,
  /** Copying the reply of a quote with a blank count or a "pick a flower" line. */
  incomplete_quote: 422,
  /** Adding or editing a stem with unit "bundle" and no bundle size above 0. */
  invalid_bundle_size: 422,
  /** Too many sign-in emails: Supabase's email rate limit. Wait and try again. */
  rate_limited: 429,
};

/** A stem row with its latest cost. Per bunch for fillers. */
export type StemWithCost = Stem & {
  /** Display name, "Rose - red". */
  name: string;
  latestCost: Money;
  /** True until a receipt replaces the sample price. */
  isSample: boolean;
};

/** A stem's display name, which is also its name in allowedStems: "Rose - red". */
export function stemName(stem: Pick<Stem, "flower" | "color">): string {
  return `${stem.flower} - ${stem.color}`;
}

export type QuoteDetail = { quote: Quote; lines: QuoteLine[] };

// POST /api/auth/sign-in — emails a magic link that returns to the address the
// form was opened on. Answers invalid_request for a malformed email and
// rate_limited when Supabase's email rate limit is hit.
export type SignInRequest = { email: string };
export type SignInResponse = { sent: true };

// POST /api/photos — multipart form with fields `kind` ("bouquets" or
// "receipts") and `photo` (the cropped, shrunken JPEG).
export type PhotoKind = "bouquets" | "receipts";
/** Storage path "<shop_id>/<uuid>.jpg" in the bucket named by kind. */
export type UploadPhotoResponse = { photoPath: string };

// GET /api/shop
export type ShopResponse = Shop;
// PATCH /api/shop
export type UpdateShopRequest = Partial<
  Pick<Shop, "name" | "wrapFee" | "laborFee" | "markupPercent" | "minimumMarginPercent" | "validForDays">
>;
export type UpdateShopResponse = Shop;

// GET /api/stems — hidden rows included, so the shop setup screen can unhide them.
export type StemListResponse = { stems: StemWithCost[] };
// POST /api/stems — answers invalid_bundle_size for a "bundle" stem without a bundle size above 0.
export type AddStemRequest = Pick<Stem, "flower" | "color" | "isFiller" | "unit" | "bundleSize" | "samplePrice">;
export type AddStemResponse = StemWithCost;
// PATCH /api/stems/[id] — edit a row, or hide it with { hidden: true }.
// Answers invalid_bundle_size when the edited row is "bundle" without a bundle size above 0.
export type UpdateStemRequest = Partial<
  Pick<Stem, "flower" | "color" | "isFiller" | "unit" | "bundleSize" | "samplePrice" | "hidden">
>;
export type UpdateStemResponse = StemWithCost;

// POST /api/receipts/extract — reads the photo; saves nothing.
export type ExtractReceiptRequest = { photoPath: string };
export type ReceiptDraftLine = {
  rawText: string;
  /** null until the florist matches the line; blocks saving. */
  stemId: string | null;
  /** quantity and unitPrice are both in `unit`, the unit written on the receipt, not the stem's usual unit. */
  quantity: number | null;
  unit: Unit | null;
  bundleSize: number | null;
  unitPrice: Money | null;
  /**
   * As written; when missing, computed as quantity × unitPrice (lib/money.ts
   * receiptLineTotal) only if the unit is known. Otherwise null, and the screen
   * asks the florist.
   */
  totalPaid: Money | null;
  /** Computed with lib/money.ts costPerStem; null while a field is missing. */
  costPerStem: Money | null;
  confidence: Confidence;
  note: string;
};
export type ExtractReceiptResponse = {
  /** Today in Manila when the AI could not read one. */
  purchaseDate: ManilaDate;
  lines: ReceiptDraftLine[];
  note: string;
  demo: boolean;
};

// POST /api/receipts — saves the checked receipt as stock batches.
export type SaveReceiptRequest = {
  photoPath: string;
  purchaseDate: ManilaDate;
  lines: Array<Pick<StockBatch, "stemId" | "quantity" | "unit" | "bundleSize" | "totalPaid">>;
};
export type SaveReceiptResponse = {
  receipt: Receipt;
  batches: StockBatch[];
  /** Open quotes this receipt turned underwater. Empty when MARGIN_ALARM is off. */
  underwaterQuoteIds: string[];
};
// GET /api/receipts — newest purchase date first.
export type ReceiptListResponse = { receipts: Array<{ receipt: Receipt; batches: StockBatch[] }> };
// DELETE /api/receipts/[id] — also deletes its photo and batches.
export type DeleteReceiptResponse = { deleted: true; underwaterQuoteIds: string[] };

// POST /api/quotes — runs analyzeBouquet on the photo and saves a draft quote.
export type CreateQuoteRequest = { photoPath: string };
export type CreateQuoteResponse = QuoteDetail & { demo: boolean };
// GET /api/quotes — newest first.
export type QuoteListItem = Quote & {
  /** sentAt − createdAt. null until the reply is first copied. */
  timeToQuoteSeconds: number | null;
};
export type QuoteListResponse = {
  quotes: QuoteListItem[];
  /** Over all of the shop's sent quotes; null when there are none. */
  averageTimeToQuoteSeconds: number | null;
};
// GET /api/quotes/[id]
export type QuoteResponse = QuoteDetail;
// PATCH /api/quotes/[id] — rename, and edit the budget, valid-until date or reply text.
export type UpdateQuoteRequest = Partial<Pick<Quote, "label" | "budget" | "validUntil" | "replyText">>;
export type UpdateQuoteResponse = Quote;
// DELETE /api/quotes/[id] — also deletes its photo and lines.
export type DeleteQuoteResponse = { deleted: true };

// PUT /api/quotes/[id]/lines — replaces the whole recipe (debounced on every
// edit). The server sets each line's costPerStem to the stem's latest cost and
// reprices the quote. Lines without an id are new.
export type UpdateQuoteLinesRequest = {
  lines: Array<
    Pick<QuoteLine, "stemId" | "count" | "countLow" | "countHigh" | "confidence" | "note"> & { id?: string }
  >;
};
export type UpdateQuoteLinesResponse = QuoteDetail;

// POST /api/quotes/[id]/reply — drafts the Taglish reply. Saves nothing; the
// text is saved when copied.
export type DraftReplyResponse = { message: string; demo: boolean };
// POST /api/quotes/[id]/copied — first copy sets status "sent", stamps sentAt
// and validUntil; later copies only save the text. Answers incomplete_quote
// while any line has a blank count or is a "pick a flower" line.
export type CopiedRequest = { replyText: string };
export type CopiedResponse = Quote;

// POST /api/quotes/[id]/budget-options — fitToBudget, priced and checked by code.
// Choosing an option sends its lines to PUT /api/quotes/[id]/lines.
export type BudgetOptionsRequest = { budget: Money };
export type BudgetOption = {
  label: string;
  lines: Array<{ stemId: string; count: number; costPerStem: Money; note: string }>;
  recipeCost: Money;
  price: Money;
  margin: number;
  /** 0 when within budget. Set only on the single cheapest option shown when none fit. */
  overBudgetBy: Money;
};
export type BudgetOptionsResponse = { options: BudgetOption[]; demo: boolean };

// POST /api/quotes/[id]/price-update — drafts the price-update message for an
// underwater quote.
export type PriceUpdateResponse = {
  message: string;
  oldPrice: Money;
  /** Same formula at latest costs. */
  newPrice: Money;
  validUntil: ManilaDate;
  demo: boolean;
};
// POST /api/quotes/[id]/price-update/apply — on copying the message: sets the
// new price, resets validUntil, clears underwaterAt, leaves sentAt alone.
export type ApplyPriceUpdateRequest = { message: string };
export type ApplyPriceUpdateResponse = Quote;

// GET /api/accuracy
/** One row of fixtures/eval/results.json, written by scripts/eval.ts. Shares are 0 to 1. */
export type EvalResult = {
  model: string;
  photoPx: number;
  stemRowAccuracy: number;
  countsWithin2: number;
  totalsWithin10Percent: number;
  receiptLineAccuracy: number;
  medianSeconds: number;
};
export type AccuracyResponse = {
  eval: EvalResult[];
  /** From the ai_calls table. */
  live: Array<{ call: AiCallName; calls: number; medianSeconds: number; averageCostUsd: number }>;
  averageCostPerQuoteUsd: number | null;
};
