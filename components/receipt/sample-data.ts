// TEMPORARY stand-in for the server until the stub routes (#4) land. Delete it then:
// screens must call the routes, never fake data. Prices here are made up.
import type { ExtractReceiptResult, NewStem, SaveReceiptRequest, SaveReceiptResponse, Stem } from "./types";

const shopId = "shop-sample";
const stem = (id: string, flower: string, color: string, unit: Stem["unit"], samplePrice: number, extra: Partial<Stem> = {}): Stem => ({
  id, shopId, flower, color, unit, samplePrice, bundleSize: null, isFiller: false, sampleSource: "sample", hidden: false, ...extra,
});

export const sampleStems: Stem[] = [
  stem("s-rose-red", "Rose", "red", "dozen", 300),
  stem("s-rose-white", "Rose", "white", "dozen", 280),
  stem("s-carnation-pink", "Carnation", "pink", "per10", 150),
  stem("s-mums-yellow", "Malaysian mums", "yellow", "bundle", 200, { bundleSize: 10 }),
  stem("s-sunflower", "Sunflower", "yellow", "piece", 60),
  stem("s-babys-breath", "Baby's breath", "white", "bunch", 120, { isFiller: true }),
  stem("s-eucalyptus", "Eucalyptus", "green", "bunch", 100, { isFiller: true }),
];

export const sampleExtract: ExtractReceiptResult = {
  purchaseDate: "2026-10-22",
  lines: [
    { rawText: "2 doz rosas pula 600", stem: "Rose - red", quantity: 2, unit: "dozen", bundleSize: null, unitPrice: 300, totalPaid: 600, confidence: "high", note: "" },
    { rawText: "carnation pink 20pc @15", stem: "Carnation - pink", quantity: 2, unit: "per10", bundleSize: null, unitPrice: 15, totalPaid: null, confidence: "medium", note: "Price per piece" },
    { rawText: "1 bundle mums dilaw 220", stem: "Malaysian mums - yellow", quantity: 1, unit: "bundle", bundleSize: 10, unitPrice: 220, totalPaid: 220, confidence: "high", note: "" },
    { rawText: "lisyantus 5pc 250", stem: null, quantity: 5, unit: "piece", bundleSize: null, unitPrice: 50, totalPaid: 250, confidence: "low", note: "Lisianthus is not on the list" },
    { rawText: "baby breath 1 bundle 130", stem: "Baby's breath - white", quantity: 1, unit: "bunch", bundleSize: null, unitPrice: 130, totalPaid: 130, confidence: "high", note: "" },
  ],
  note: "",
};

export function fakeAddStem(input: NewStem): Stem {
  const added = stem(`s-new-${sampleStems.length}`, input.flower, input.color, input.unit, 0, input);
  sampleStems.push(added);
  return added;
}

// The real save route computes cost per stem with lib/money.ts.
const stemsPerUnit = { dozen: 12, per10: 10, bunch: 1, piece: 1 } as const;

export function fakeSave(req: SaveReceiptRequest): SaveReceiptResponse {
  const createdAt = new Date().toISOString();
  const receipt = { id: "r-sample", shopId, purchaseDate: req.purchaseDate, photoPath: req.photoPath, createdAt };
  const batches = req.lines.map((line, i) => {
    const perUnit = line.unit === "bundle" ? (line.bundleSize ?? 1) : stemsPerUnit[line.unit];
    const costPerStem = Math.round((line.totalPaid / (line.quantity * perUnit)) * 100) / 100;
    return { ...line, id: `b-${i}`, receiptId: receipt.id, shopId, costPerStem, createdAt };
  });
  return { receipt, batches, underwaterCount: 2 };
}
