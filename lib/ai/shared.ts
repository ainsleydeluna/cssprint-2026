// Pieces the AI calls share: the shop's rows as the AI sees them, photos, and
// name matching (docs/spec.md section 6: names match rows ignoring capitals).

import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages";
import type { StemWithCost } from "../contract";
import type { ManilaDate, Money } from "../types";
import type { AiOutcome } from "./client";

/** One of the shop's visible rows, as an AI call needs it. */
export type AllowedStem = Pick<StemWithCost, "name" | "isFiller">;

/** The cropped, shrunken photo, as stored. */
export type Photo = { data: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" };

export function photoBlock(photo: Photo): BetaContentBlockParam {
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
    stems.filter((stem) => stem.isFiller === isFiller).map((stem) => `- ${describe(stem)}`).join("\n") || "(none)";
  return `Allowed list.\nFlowers:\n${names(false)}\nFillers:\n${names(true)}`;
}

/** The shop's row with this name, ignoring capital letters and outer spaces. */
export function findStem<S extends AllowedStem>(stems: S[], name: string | null): S | undefined {
  if (name === null) return undefined;
  const wanted = name.trim().toLowerCase();
  return stems.find((stem) => stem.name.toLowerCase() === wanted);
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

/**
 * Passes a drafted message through only if it carries each text exactly, so a
 * customer never gets a wrong price or date.
 */
export function requireTexts(
  outcome: AiOutcome<{ message: string; note: string }>,
  texts: string[],
  what: string,
): AiOutcome<{ message: string; note: string }> {
  if (!outcome.ok) return outcome;
  // Not followed by more digits, so "Oct 2" does not pass inside "Oct 20".
  const has = (text: string) =>
    new RegExp(`${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d|,\\d)`).test(outcome.result.message);
  const missing = texts.find((text) => !has(text));
  return missing === undefined ? outcome : { ...outcome, ok: false, error: `${what} is missing ${missing}` };
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
