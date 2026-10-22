// TEMPORARY until the contract (#4) lands: copies of docs/spec.md shapes.
// Then replace this file with imports from lib/types.ts and lib/contract.ts.

export type Unit = "dozen" | "per10" | "bundle" | "bunch" | "piece";
export type Confidence = "low" | "medium" | "high";
export type Money = number; // pesos, two decimals

// spec section 5 (lib/types.ts)
export type Stem = {
  id: string; shopId: string;
  flower: string; color: string;
  isFiller: boolean;
  unit: Unit; bundleSize: number | null;
  samplePrice: Money;
  sampleSource: string;
  hidden: boolean;
};

export type Receipt = {
  id: string; shopId: string; purchaseDate: string; photoPath: string; createdAt: string;
};

export type StockBatch = {
  id: string; receiptId: string; shopId: string; stemId: string;
  quantity: number; unit: Unit; bundleSize: number | null;
  totalPaid: Money; costPerStem: Money;
  createdAt: string;
};

// spec section 6 (lib/contract.ts)
export type ExtractReceiptResult = {
  purchaseDate: string | null;
  lines: Array<{
    rawText: string;
    stem: string | null;
    quantity: number | null;
    unit: Unit | null;
    bundleSize: number | null;
    unitPrice: number | null;
    totalPaid: number | null;
    confidence: Confidence;
    note: string;
  }>;
  note: string;
};

// Our guesses at the route shapes; lib/contract.ts will define the real ones.
export type NewStem = Pick<Stem, "flower" | "color" | "isFiller" | "unit" | "bundleSize">;
export type ReceiptLineInput = Pick<StockBatch, "stemId" | "quantity" | "unit" | "bundleSize" | "totalPaid">;
export type SaveReceiptRequest = { photoPath: string; purchaseDate: string; lines: ReceiptLineInput[] };
export type SaveReceiptResponse = { receipt: Receipt; batches: StockBatch[]; underwaterCount: number };
