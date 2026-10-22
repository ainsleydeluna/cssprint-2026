import { describe, expect, test } from "vitest";
import type { ExtractReceiptResult } from "../contract";
import { extractReceipt } from "./extractReceipt";
import { fakeApi, fakeMessage } from "./fakeApi";

const photo = { data: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg" as const };
const stems = [
  { name: "Rose - red", isFiller: false, hidden: false },
  { name: "Baby's breath - white", isFiller: true, hidden: false },
  { name: "Tulip - pink", isFiller: false, hidden: true },
];

type Line = ExtractReceiptResult["lines"][number];
const line = (overrides: Partial<Line>): Line => ({
  rawText: "2 dz red rose @270 = 540",
  stem: "Rose - red",
  quantity: 2,
  unit: "dozen",
  bundleSize: null,
  unitPrice: 270,
  totalPaid: 540,
  confidence: "high",
  note: "",
  ...overrides,
});

async function extract(answer: ExtractReceiptResult) {
  const { api, requests } = fakeApi(fakeMessage(answer));
  return { outcome: await extractReceipt({ photo, stems }, api), request: requests[0] };
}

describe("extractReceipt", () => {
  test("sends the photo and the shop's row names", async () => {
    const { request } = await extract({ purchaseDate: null, lines: [], note: "" });

    const content = request.messages[0].content;
    expect(content).toContainEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/" } });
    expect(JSON.stringify(content)).toContain("Baby's breath - white");
  });

  test("matches a row name ignoring capital letters and returns the shop's spelling", async () => {
    const { outcome } = await extract({ purchaseDate: "2026-10-22", lines: [line({ stem: "rose - RED" })], note: "" });

    expect(outcome.ok && outcome.result.lines[0].stem).toBe("Rose - red");
  });

  test("leaves a line unmatched when its name is not one of the shop's rows", async () => {
    const { outcome } = await extract({ purchaseDate: null, lines: [line({ stem: "Lily - white" })], note: "" });

    expect(outcome.ok && outcome.result.lines[0].stem).toBeNull();
  });

  test("leaves a line unmatched when its name matches only a hidden row", async () => {
    const { outcome, request } = await extract({ purchaseDate: null, lines: [line({ stem: "Tulip - pink" })], note: "" });

    expect(JSON.stringify(request.messages[0].content)).not.toContain("Tulip");
    expect(outcome.ok && outcome.result.lines[0].stem).toBeNull();
  });

  test("counts a filler sold per bundle as one bunch each", async () => {
    const { outcome } = await extract({
      purchaseDate: null,
      lines: [line({ rawText: "2 bndl bb breath 160", stem: "Baby's breath - white", unit: "bundle", bundleSize: 10, quantity: 2 })],
      note: "",
    });

    expect(outcome.ok && outcome.result.lines[0]).toMatchObject({ quantity: 2, unit: "bunch", bundleSize: null });
  });

  test("keeps a main flower bought per bundle as a bundle", async () => {
    const { outcome } = await extract({ purchaseDate: null, lines: [line({ unit: "bundle", bundleSize: 10 })], note: "" });

    expect(outcome.ok && outcome.result.lines[0]).toMatchObject({ unit: "bundle", bundleSize: 10 });
  });

  test("drops a purchase date that is not a real YYYY-MM-DD date", async () => {
    const { outcome } = await extract({ purchaseDate: "2026-13-45", lines: [], note: "" });

    expect(outcome.ok && outcome.result.purchaseDate).toBeNull();
  });

  test("returns an error, not a crash, when the answer has no lines", async () => {
    const { api } = fakeApi(fakeMessage({ purchaseDate: null, note: "" }));

    expect(await extractReceipt({ photo, stems }, api)).toMatchObject({ ok: false, error: "Answer is missing lines" });
  });

  test("passes a failed call through", async () => {
    const { api } = fakeApi(fakeMessage("not json"));

    expect(await extractReceipt({ photo, stems }, api)).toMatchObject({ ok: false, error: "Answer was not valid JSON" });
  });
});
