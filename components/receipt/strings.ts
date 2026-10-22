// Labels not yet in content/strings.json, listed for Zach in the PR. Labels that are
// there come from t() in lib/strings.ts; move these over once he adds them.
import type { Unit } from "@/lib/types";

export const units: Record<Unit, string> = {
  dozen: "Dosena",
  per10: "Per 10",
  bundle: "Bundle",
  bunch: "Bunch",
  piece: "Piraso",
};

export const scan = {
  uploading: "Ina-upload ang photo…",
  reading: "Binabasa ang resibo…",
  saving: "Sine-save ang resibo…",
  onReceipt: "Sa resibo:",
  stem: "Bulaklak",
  choose: "Pumili…",
  addRow: "+ Bagong row",
  newFlower: "Pangalan ng bulaklak",
  newColor: "Kulay",
  isFiller: "Filler ito",
  samplePrice: "Sample na presyo bawat unit (₱)",
  addRowSave: "Idagdag sa listahan",
  bundleSizeNeeded: "Ilagay muna kung ilang stem bawat bundle.",
  quantity: "Dami",
  unit: "Unit",
  bundleSize: "Stem bawat bundle",
  totalPaid: "Binayaran (₱)",
  unitPriceHint: (price: number) => `@₱${price} sa resibo`,
  remove: "Burahin ang linya",
  unmatched: (n: number) => `${n} linya ang hindi pa naitugma.`,
  incomplete: (n: number) => `${n} linya ang kulang ang dami, unit o bayad.`,
  noLines: "Walang linya na ise-save.",
  save: "I-save ang resibo",
  saved: "Na-save ang resibo. Bagong cost bawat stem:",
  perStem: "bawat stem",
  perBunch: "bawat bunch",
  scanAgain: "Mag-scan ng isa pa",
};
