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
const goodMessage = "Hi po! 12 red roses at baby's breath. ₱1,220 po, valid hanggang Oct 25. Salamat po!";

async function reply(message: string, overrides: Partial<typeof input> = {}) {
  const { api, requests } = fakeApi(fakeMessage({ message, note: "" }));
  return { outcome: await draftReply({ ...input, ...overrides }, api), request: requests[0] };
}

describe("draftReply", () => {
  test("sends the shop name, flowers with counts, the price and the valid-until date written out", async () => {
    const { request } = await reply(goodMessage);

    const text = JSON.stringify(request.messages[0].content);
    expect(text).toContain("Bulaklak ni Liza");
    expect(text).toContain("Rose - red: 12 stems");
    expect(text).toContain("Baby's breath - white: 1 bunch");
    expect(text).toContain("₱1,220");
    expect(text).toContain("Oct 25");
  });

  test("says there is no shop name when it is blank", async () => {
    const { request } = await reply(goodMessage, { shopName: "" });

    expect(JSON.stringify(request.messages[0].content)).toContain("Shop name: none");
  });

  test("returns the message", async () => {
    const { outcome } = await reply(goodMessage);

    expect(outcome).toMatchObject({ ok: true, result: { message: goodMessage, note: "" } });
  });

  test("fails a message that leaves out the price as written", async () => {
    const { outcome } = await reply("Hi po! 12 red roses. ₱1220 po, valid hanggang Oct 25.");

    expect(outcome).toMatchObject({ ok: false, error: "Reply is missing ₱1,220" });
  });

  test("fails a message that leaves out the valid-until date", async () => {
    const { outcome } = await reply("Hi po! 12 red roses. ₱1,220 po. Salamat po!");

    expect(outcome).toMatchObject({ ok: false, error: "Reply is missing Oct 25" });
  });
});
