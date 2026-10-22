import { describe, expect, test } from "vitest";
import { draftReply } from "./draftReply";
import { fakeApi, fakeMessage } from "./fakeApi";

const input = {
  shopName: "Bulaklak ni Liza",
  lines: [
    { stem: "Rose - red", count: 12, isFiller: false },
    { stem: "Baby's breath - white", count: 1, isFiller: true },
  ],
  price: 1220,
  validUntil: "2026-10-25",
};
const draft = "Hi po! 12 red roses at baby's breath. {price} po, valid hanggang {validUntil}. Salamat po!";

async function reply(message: string, overrides: Partial<typeof input> = {}) {
  const { api, requests } = fakeApi(fakeMessage({ message, note: "" }));
  return { outcome: await draftReply({ ...input, ...overrides }, api), request: requests[0] };
}

describe("draftReply", () => {
  test("sends the shop name and flowers with counts, and asks for the placeholders instead of the price", async () => {
    const { request } = await reply(draft);

    const text = JSON.stringify(request.messages[0].content);
    expect(text).toContain("Bulaklak ni Liza");
    expect(text).toContain("Rose - red: 12 stems");
    expect(text).toContain("Baby's breath - white: 1 bunch");
    expect(text).not.toContain("1,220");
    expect(request.system).toContain("{price}");
    expect(request.system).toContain("{validUntil}");
  });

  test("says there is no shop name when it is blank", async () => {
    const { request } = await reply(draft, { shopName: "" });

    expect(JSON.stringify(request.messages[0].content)).toContain("Shop name: none");
  });

  test("fills in the price and the Manila date", async () => {
    const { outcome } = await reply(draft);

    expect(outcome).toMatchObject({
      ok: true,
      result: { message: "Hi po! 12 red roses at baby's breath. ₱1,220 po, valid hanggang Oct 25. Salamat po!" },
    });
  });

  test("fills in a price with centavos", async () => {
    const { outcome } = await reply(draft, { price: 1220.5 });

    expect(outcome.ok && outcome.result.message).toContain("₱1,220.50 po");
  });

  test("fails a message without {price}", async () => {
    const { outcome } = await reply("Hi po! 12 red roses, valid hanggang {validUntil}.");

    expect(outcome).toMatchObject({ ok: false, error: "Reply must use {price} exactly once" });
  });

  test("fails a message that uses {validUntil} twice", async () => {
    const { outcome } = await reply(`${draft} Hanggang {validUntil} lang po.`);

    expect(outcome).toMatchObject({ ok: false, error: "Reply must use {validUntil} exactly once" });
  });

  test.each(["₱1,220", "P1,220", "PHP 1220", "1,220 pesos"])("fails a message that writes %s itself", async (amount) => {
    const { outcome } = await reply(`${draft} Total ${amount} po.`);

    expect(outcome).toMatchObject({ ok: false, error: "Reply wrote a peso amount itself" });
  });
});
