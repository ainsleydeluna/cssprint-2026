// Pieces the AI calls share: the shop's rows as the AI sees them, photos, and
// name matching (docs/spec.md section 6: names match rows ignoring capitals).

import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { StemWithCost } from "../contract";

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
export function stemList(stems: AllowedStem[]): string {
  const names = (isFiller: boolean) =>
    stems
      .filter((stem) => !stem.hidden && stem.isFiller === isFiller)
      .map((stem) => `- ${stem.name}`)
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
