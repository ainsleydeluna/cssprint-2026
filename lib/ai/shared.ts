// Pieces the AI calls share: the shop's rows as the AI sees them, photos, and
// name matching (docs/spec.md section 6: names match rows ignoring capitals).

import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { StemWithCost } from "../contract";
import type { ManilaDate, Money } from "../types";
import type { AiOutcome } from "./client";

/** One of the shop's rows, as an AI call needs it. Hidden rows are never offered or matched. */
export type AllowedStem = Pick<StemWithCost, "name" | "isFiller" | "hidden">;

/** The cropped, shrunken photo, as stored. */
export type Photo = { data: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" };

export function photoBlock(photo: Photo): ContentBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: photo.mediaType, data: Buffer.from(photo.data).toString("base64") },
  };
}

/**
 * The allowed list as the prompt shows it. Fillers get their own heading, not
 * a marker after the name, which the model copied into its answers.
 */
export function stemList<S extends AllowedStem>(stems: S[], describe: (stem: S) => string = (stem) => stem.name): string {
  const names = (isFiller: boolean) =>
    stems
      .filter((stem) => !stem.hidden && stem.isFiller === isFiller)
      .map((stem) => `- ${describe(stem)}`)
      .join("\n") || "(none)";
  return `Allowed list.\nFlowers:\n${names(false)}\nFillers:\n${names(true)}`;
}

/** The shop's visible row with this name, ignoring capital letters and outer spaces. */
export function findStem<S extends AllowedStem>(stems: S[], name: string | null): S | undefined {
  if (name === null) return undefined;
  const wanted = name.trim().toLowerCase();
  return stems.find((stem) => !stem.hidden && stem.name.toLowerCase() === wanted);
}

/** Like findStem, but only a flower row: a closest stem is never a filler. */
export function findFlower<S extends AllowedStem>(stems: S[], name: string | null): S | undefined {
  const stem = findStem(stems, name);
  return stem?.isFiller ? undefined : stem;
}

/** "12 stems", "1 bunch": flowers are counted in stems, fillers in bunches. */
export function countText(count: number, isFiller: boolean): string {
  if (isFiller) return `${count} ${count === 1 ? "bunch" : "bunches"}`;
  return `${count} ${count === 1 ? "stem" : "stems"}`;
}

/** "₱1,220", or "₱22.50" when there are centavos. */
export function pesos(amount: Money): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return `₱${amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A Manila calendar date as the reply writes it: "2026-10-25" is "Oct 25". */
export function shortDate(date: ManilaDate): string {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/** "₱1,220", "P1,220", "PHP 1220", "1,220 pesos" or "1,220 piso": an amount the model wrote itself. */
const PESO_AMOUNT = [/₱/, /\bPHP\b/, /\bP ?\d/, /\d[\d,.]*\s*(?:pesos?|piso)\b/i];

/**
 * Fills a drafted message's placeholders, so the model never writes a price or
 * date. Each required placeholder must appear exactly once, each optional one
 * at most once, and the model must not write a peso amount of its own.
 */
export function fillPlaceholders(
  outcome: AiOutcome<{ message: string; note: string }>,
  values: { required: Record<string, string>; optional?: Record<string, string> },
  what: string,
): AiOutcome<{ message: string; note: string }> {
  if (!outcome.ok) return outcome;
  const draft = outcome.result.message;
  const fail = (error: string) => ({ ...outcome, ok: false as const, error });

  const uses = (name: string) => draft.split(`{${name}}`).length - 1;
  for (const name of Object.keys(values.required)) {
    if (uses(name) !== 1) return fail(`${what} must use {${name}} exactly once`);
  }
  for (const name of Object.keys(values.optional ?? {})) {
    if (uses(name) > 1) return fail(`${what} must use {${name}} at most once`);
  }
  if (PESO_AMOUNT.some((pattern) => pattern.test(draft))) return fail(`${what} wrote a peso amount itself`);

  let message = draft;
  for (const [name, value] of Object.entries({ ...values.required, ...values.optional })) {
    message = message.split(`{${name}}`).join(value);
  }
  return { ...outcome, result: { ...outcome.result, message } };
}

/** JSON schema pieces for structured outputs. */
export const schema = {
  nullable: (type: string, extra: Record<string, unknown> = {}) => ({ anyOf: [{ type, ...extra }, { type: "null" }] }),
  confidence: { type: "string", enum: ["low", "medium", "high"] },
  object: (properties: Record<string, unknown>) => ({
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }),
};
