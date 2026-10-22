// TEMPORARY until content/strings.json and its typed helper land (#4, #15).
import type { Unit } from "./types";

export const units: Record<Unit, string> = {
  dozen: "Dosena",
  per10: "Per 10",
  bundle: "Bundle",
  bunch: "Bunch",
  piece: "Piraso",
};

export const scan = {
  title: "I-scan ang resibo",
  takePhoto: "Kunan ang resibo",
  uploading: "Ina-upload ang photo…",
  reading: "Binabasa ang resibo…",
  saving: "Sine-save ang resibo…",
  failed: "May mali. Subukan ulit.",
  purchaseDate: "Petsa ng bili",
  onReceipt: "Sa resibo:",
  stem: "Bulaklak",
  matchLine: "Itugma ang linyang ito",
  choose: "Pumili…",
  addRow: "+ Bagong row",
  newFlower: "Pangalan ng bulaklak",
  newColor: "Kulay",
  isFiller: "Filler ito",
  addRowSave: "Idagdag sa listahan",
  quantity: "Dami",
  unit: "Unit",
  bundleSize: "Stem bawat bundle",
  totalPaid: "Binayaran (₱)",
  unitPriceHint: (price: number) => `@₱${price} sa resibo`,
  remove: "Burahin ang linya",
  unmatched: (n: number) => `${n} linya ang hindi pa naitugma.`,
  incomplete: (n: number) => `${n} linya ang kulang ang dami o bayad.`,
  noLines: "Walang linya na ise-save.",
  save: "I-save ang resibo",
  saved: "Na-save ang resibo. Bagong cost bawat stem:",
  perStem: "bawat stem",
  perBunch: "bawat bunch",
  underwater: (n: number) => `${n} open quote ang underwater na ngayon.`,
  scanAgain: "Mag-scan ng isa pa",
};
