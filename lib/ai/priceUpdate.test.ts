import { describe, expect, test } from "vitest";
import { fakeApi, fakeMessage } from "./fakeApi";
import { priceUpdate } from "./priceUpdate";

const input = { oldPrice: 960, newPrice: 1130, validUntil: "2026-10-26" };

async function update(message: string) {
  const { api, requests } = fakeApi(fakeMessage({ message, note: "" }));
  return { outcome: await priceUpdate(input, api), request: requests[0] };
}

describe("priceUpdate", () => {
  test("sends the old price, new price and new valid-until date written out", async () => {
    const { request } = await update("₱960 ₱1,130 Oct 26");

    const text = JSON.stringify(request.messages[0].content);
    expect(text).toContain("Old price: ₱960");
    expect(text).toContain("New price: ₱1,130");
    expect(text).toContain("Valid until: Oct 26");
  });

  test("returns the message", async () => {
    const message = "Hi po! Pasensya na po, tumaas ang presyo ng roses. Mula ₱960, ₱1,130 na po, valid hanggang Oct 26.";
    const { outcome } = await update(message);

    expect(outcome).toMatchObject({ ok: true, result: { message } });
  });

  test("fails a message that leaves out the new price", async () => {
    const { outcome } = await update("Hi po! ₱960 po dati, valid hanggang Oct 26.");

    expect(outcome).toMatchObject({ ok: false, error: "Price update is missing ₱1,130" });
  });
});
