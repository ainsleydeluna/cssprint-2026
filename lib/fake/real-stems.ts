// Stub routes still answer fake data, but the stems are real (T2). Until T4 and
// T5 replace the stubs, every fake stem id in a stub's answer is swapped for the
// signed-in shop's real stem with the same "Flower - color" name, so screens can
// look lines up in GET /api/stems. Delete this file with the last stub.

import { stemName } from "../contract";
import { requireShop } from "../server/auth";
import type { Stem } from "../types";
import { stems as fakeStems } from "./data";

const fakeNameById = new Map(fakeStems.map((stem) => [stem.id, stem.name.toLowerCase()]));

/**
 * `body` with every fake `stemId` swapped for the real stem of the same name
 * (ignoring capitals), or null when the shop has no such row: a "pick a flower"
 * line or an unmatched receipt line. Real ids and nulls are left alone.
 */
export function swapStemIds<T>(body: T, realStems: Array<Pick<Stem, "id" | "flower" | "color">>): T {
  const realIdByName = new Map(realStems.map((stem) => [stemName(stem).toLowerCase(), stem.id]));
  return JSON.parse(JSON.stringify(body), (key, value) => {
    if (key !== "stemId" || typeof value !== "string" || !fakeNameById.has(value)) return value;
    return realIdByName.get(fakeNameById.get(value)!) ?? null;
  });
}

/** A stub's fake answer with the signed-in shop's real stem ids, or `unauthorized` when signed out. */
export async function withRealStemIds(body: unknown): Promise<Response> {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const { data, error } = await session.supabase.from("stems").select("id, flower, color");
  if (error) throw new Error(`Reading stems failed: ${error.message}`);
  return Response.json(swapStemIds(body, data));
}
