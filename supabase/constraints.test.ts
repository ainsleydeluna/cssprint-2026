// Database rules the routes rely on, checked as test Shop A on cssprint-dev:
// trimmed stem names, complete sent quotes, and columns that never change.
// Skipped without the test-account keys. Every row it changes is put back or deleted.

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { signInTestShop, testAccountsReady } from "./test-accounts";

/** Postgres check_violation and insufficient_privilege. */
const CHECK_VIOLATION = "23514";
const NO_PRIVILEGE = "42501";

describe.skipIf(!testAccountsReady)("database rules", () => {
  let client: SupabaseClient;
  let shopId: string;
  let quoteId: string;
  let lineId: string;

  beforeAll(async () => {
    ({ client, shopId } = await signInTestShop("A"));
    const quote = await client
      .from("quotes")
      .insert({ shop_id: shopId, label: "Rules check", photo_path: `${shopId}/${crypto.randomUUID()}.jpg` })
      .select("id")
      .single();
    if (quote.error) throw new Error(quote.error.message);
    quoteId = quote.data.id;
    const line = await client
      .from("quote_lines")
      .insert({ quote_id: quoteId, shop_id: shopId, stem_id: null, count: null, count_low: 1, count_high: 2, confidence: "low" })
      .select("id")
      .single();
    if (line.error) throw new Error(line.error.message);
    lineId = line.data.id;
  }, 30_000);

  afterAll(async () => {
    // Deleting the quote deletes its lines too.
    if (quoteId) await client.from("quotes").delete().eq("id", quoteId);
  });

  test.each([
    ["flower", " Rose"],
    ["color", "red "],
  ])("a stem's %s must have no spaces around it", async (column, value) => {
    const rose = await client.from("stems").select("id, flower, color").eq("flower", "Rose").eq("color", "red").single();
    if (rose.error) throw new Error(rose.error.message);
    try {
      const update = await client.from("stems").update({ [column]: value }).eq("id", rose.data.id);
      expect(update.error?.code).toBe(CHECK_VIOLATION);
    } finally {
      await client.from("stems").update({ flower: rose.data.flower, color: rose.data.color }).eq("id", rose.data.id);
    }
  });

  test.each(["sent", "expired"])("a %s quote needs a price, valid-until date and sent time", async (status) => {
    const update = await client.from("quotes").update({ status }).eq("id", quoteId).select("id");
    expect(update.error?.code).toBe(CHECK_VIOLATION);
    await client.from("quotes").update({ status: "draft" }).eq("id", quoteId);

    const complete = await client
      .from("quotes")
      .update({ status, price: 570, valid_until: "2026-10-25", sent_at: new Date().toISOString() })
      .eq("id", quoteId)
      .select("id");
    expect(complete.error).toBeNull();
    await client.from("quotes").update({ status: "draft", price: null, valid_until: null, sent_at: null }).eq("id", quoteId);
  });

  test.each([
    ["quotes", "id", () => quoteId],
    ["quotes", "shop_id", () => quoteId],
    ["quotes", "created_at", () => quoteId],
    ["quote_lines", "id", () => lineId],
    ["quote_lines", "shop_id", () => lineId],
    ["quote_lines", "quote_id", () => lineId],
    ["quote_lines", "created_at", () => lineId],
  ])("%s.%s cannot be updated", async (table, column, id) => {
    const value = column === "created_at" ? "2000-01-01T00:00:00Z" : column === "shop_id" ? shopId : crypto.randomUUID();
    const update = await client.from(table).update({ [column]: value }).eq("id", id());
    expect(update.error?.code).toBe(NO_PRIVILEGE);
  });

  test("a quote's own fields can still be updated", async () => {
    const update = await client.from("quotes").update({ label: "Rules check, renamed", budget: 1000 }).eq("id", quoteId).select("label");
    expect(update.error).toBeNull();
    expect(update.data).toEqual([{ label: "Rules check, renamed" }]);
    const line = await client.from("quote_lines").update({ count: 2, note: "checked" }).eq("id", lineId).select("count");
    expect(line.data).toEqual([{ count: 2 }]);
  });
});
