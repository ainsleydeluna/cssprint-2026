// Shared data shapes (docs/spec.md section 5). Database columns are the same
// names in snake_case. Only Ice changes this file, and tells the team when he does.

export type Unit = "dozen" | "per10" | "bundle" | "bunch" | "piece";
export type Confidence = "low" | "medium" | "high";
export type QuoteStatus = "draft" | "sent" | "expired";
export type AiCallName =
  | "extractReceipt"
  | "analyzeBouquet"
  | "fitToBudget"
  | "draftReply"
  | "priceUpdate";

/** Pesos with two decimals. Only a quote's final price is rounded, up to ₱10. */
export type Money = number;

/** "YYYY-MM-DD", a calendar date in Asia/Manila. */
export type ManilaDate = string;

/** ISO 8601 timestamp in UTC. */
export type Timestamp = string;

export type Shop = {
  id: string;
  ownerId: string;
  /** Optional; used only in the reply. "" when not set. */
  name: string;
  wrapFee: Money;
  laborFee: Money;
  markupPercent: number;
  /** Default 20. */
  minimumMarginPercent: number;
  /** Days a sent quote's price holds. Default 2. */
  validForDays: number;
  createdAt: Timestamp;
};

/** One row of the shop's flower list: a flower plus a color, e.g. "Rose - red". */
export type Stem = {
  id: string;
  shopId: string;
  flower: string;
  color: string;
  isFiller: boolean;
  unit: Unit;
  /** Stems per bundle. Only set when unit is "bundle". */
  bundleSize: number | null;
  /** Per unit, shown labeled "sample" until a receipt replaces it. */
  samplePrice: Money;
  /** Where the sample price came from. */
  sampleSource: string;
  /** Stems are never deleted, only hidden. */
  hidden: boolean;
};

export type Receipt = {
  id: string;
  shopId: string;
  purchaseDate: ManilaDate;
  photoPath: string;
  createdAt: Timestamp;
};

/** One receipt line (table receipt_lines). */
export type StockBatch = {
  id: string;
  receiptId: string;
  shopId: string;
  stemId: string;
  quantity: number;
  unit: Unit;
  bundleSize: number | null;
  totalPaid: Money;
  /** Computed with lib/money.ts costPerStem on save. Per bunch for fillers. */
  costPerStem: Money;
  createdAt: Timestamp;
};

export type Quote = {
  id: string;
  shopId: string;
  /** "Inquiry N" until the florist renames it. Never a customer name or number. */
  label: string;
  status: QuoteStatus;
  photoPath: string;
  budget: Money | null;
  price: Money | null;
  replyText: string;
  validUntil: ManilaDate | null;
  underwaterAt: Timestamp | null;
  createdAt: Timestamp;
  /** Stamped by the first copy of the reply; later copies leave it alone. */
  sentAt: Timestamp | null;
};

export type QuoteLine = {
  id: string;
  quoteId: string;
  shopId: string;
  /** null = a "pick a flower" line, which blocks copying the reply. */
  stemId: string | null;
  /** null = blank; the florist must fill it before copying the reply. Bunches for fillers. */
  count: number | null;
  countLow: number;
  countHigh: number;
  confidence: Confidence;
  note: string;
  /** Latest cost at the time of pricing. Per bunch for fillers. */
  costPerStem: Money;
};

export type AiCall = {
  id: string;
  shopId: string;
  call: AiCallName;
  model: string;
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  quoteId: string | null;
  receiptId: string | null;
  ok: boolean;
  /** Short error text; "" when ok. */
  error: string;
  createdAt: Timestamp;
};
