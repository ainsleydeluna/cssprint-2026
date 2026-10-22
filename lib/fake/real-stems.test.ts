import { expect, test } from "vitest";
import { stemIds as fake } from "./data";
import { swapStemIds } from "./real-stems";
import { budgetOptions, extractReceipt } from "./responses";

const realStems = [
  { id: "real-rose-red", flower: "Rose", color: "Red" },
  { id: "real-alstroemeria", flower: "Alstroemeria", color: "mixed" },
  { id: "real-babys-breath", flower: "Baby's breath", color: "white" },
  { id: "real-carnation-pink", flower: "Carnation", color: "pink" },
  { id: "real-stargazer", flower: "Stargazer lily", color: "pink" },
];

test("swaps a fake stem id for the real stem with the same name, ignoring capitals", () => {
  expect(swapStemIds({ stemId: fake.roseRed }, realStems)).toEqual({ stemId: "real-rose-red" });
});

test("a fake stem id whose name has no real match becomes null", () => {
  // The fake list has "Eucalyptus - green"; this shop does not.
  expect(swapStemIds({ stemId: fake.eucalyptus }, realStems)).toEqual({ stemId: null });
});

test("leaves real ids, null stem ids and other fields alone", () => {
  const body = { id: fake.roseRed, stemId: "real-rose-red", other: { stemId: null }, count: 3 };
  expect(swapStemIds(body, realStems)).toEqual(body);
});

test("swaps every stem id in a nested response", () => {
  const swapped = swapStemIds(extractReceipt, realStems);
  expect(swapped.lines.map((line) => line.stemId)).toEqual([
    "real-rose-red",
    "real-alstroemeria",
    "real-babys-breath",
    "real-carnation-pink",
    null,
  ]);
  expect(swapped.lines[0].rawText).toBe(extractReceipt.lines[0].rawText);

  const options = swapStemIds(budgetOptions, realStems);
  expect(options.options[0].lines.map((line) => line.stemId)).toEqual([
    "real-stargazer",
    "real-alstroemeria",
    null, // Rose - white is not in this shop
    "real-babys-breath",
  ]);
});
