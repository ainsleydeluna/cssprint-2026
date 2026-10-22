// Pieces the AI calls share: the shop's rows as the AI sees them, photos, and
// name matching (docs/spec.md section 6: names match rows ignoring capitals).

import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages";
import type { StemWithCost } from "../contract";

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
export function stemList(stems: AllowedStem[]): string {
  const names = (isFiller: boolean) =>
    stems.filter((stem) => stem.isFiller === isFiller).map((stem) => `- ${stem.name}`).join("\n") || "(none)";
  return `Allowed list.\nFlowers:\n${names(false)}\nFillers:\n${names(true)}`;
}

/** The shop's row with this name, ignoring capital letters and outer spaces. */
export function findStem<S extends AllowedStem>(stems: S[], name: string | null): S | undefined {
  if (name === null) return undefined;
  const wanted = name.trim().toLowerCase();
  return stems.find((stem) => stem.name.toLowerCase() === wanted);
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
