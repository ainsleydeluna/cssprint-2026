import { describe, expect, test } from "vitest";
import { fakeApi, fakeMessage } from "./fakeApi";
import { priceUpdate } from "./priceUpdate";

const input = { oldPrice: 960, newPrice: 1130, validUntil: "2026-10-26" };

async function update(message: string) {
  const { api, requests } = fakeApi(fakeMessage({ message, note: "" }));
  return { outcome: await priceUpdate(input, api), request: requests[0] };
}

describe("priceUpdate", () => {
  test("asks for the placeholders and sends no peso amounts", async () => {
    const { request } = await update("{price} {validUntil}");

    expect(request.system).toContain("{price}");
    expect(request.system).toContain("{validUntil}");
    expect(request.system).toContain("{oldPrice}");
    expect(JSON.stringify(request.messages[0].content)).not.toMatch(/960|1,130/);
  });

  test("fills in the new price, the date and the old price", async () => {
    const { outcome } = await update("Pasensya na po. Mula {oldPrice}, {price} na po, valid hanggang {validUntil}.");

    expect(outcome).toMatchObject({
      ok: true,
      result: { message: "Pasensya na po. Mula ₱960, ₱1,130 na po, valid hanggang Oct 26." },
    });
  });

  test("passes a message without the old price", async () => {
    const { outcome } = await update("Pasensya na po, {price} na po, valid hanggang {validUntil}.");

    expect(outcome).toMatchObject({ ok: true, result: { message: "Pasensya na po, ₱1,130 na po, valid hanggang Oct 26." } });
  });

  test("fails a message without {validUntil}", async () => {
    const { outcome } = await update("Pasensya na po, {price} na po.");

    expect(outcome).toMatchObject({ ok: false, error: "Price update must use {validUntil} exactly once" });
  });

  test("fails a message that writes the old price itself", async () => {
    const { outcome } = await update("Mula ₱960, {price} na po, valid hanggang {validUntil}.");

    expect(outcome).toMatchObject({ ok: false, error: "Price update wrote a peso amount itself" });
  });
});
