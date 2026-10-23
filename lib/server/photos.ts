import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoKind } from "../contract";

/**
 * Saves a cropped, shrunken JPEG in the private bucket named by `kind`, at
 * "<shop_id>/<uuid>.jpg" (spec decision 16), and returns that path. Storage
 * rules refuse any other shop's folder.
 */
export async function uploadPhoto(supabase: SupabaseClient, shopId: string, kind: PhotoKind, photo: Blob): Promise<string> {
  const photoPath = `${shopId}/${crypto.randomUUID()}.jpg`;
  // A Blob's own type wins over the contentType option, and the buckets accept only image/jpeg.
  const jpeg = photo.type === "image/jpeg" ? photo : new Blob([photo], { type: "image/jpeg" });
  const { error } = await supabase.storage.from(kind).upload(photoPath, jpeg, { contentType: "image/jpeg" });
  if (error) throw new Error(`Uploading the photo failed: ${error.message}`);
  return photoPath;
}

/** A stored photo's bytes, or null when the shop has no photo at that path. */
export async function downloadPhoto(supabase: SupabaseClient, kind: PhotoKind, photoPath: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(kind).download(photoPath);
  if (error) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Deletes a stored photo (decision 16: deleting a quote or receipt deletes its photo). A missing photo is not an error. */
export async function deletePhoto(supabase: SupabaseClient, kind: PhotoKind, photoPath: string): Promise<void> {
  const { error } = await supabase.storage.from(kind).remove([photoPath]);
  if (error) throw new Error(`Deleting the photo failed: ${error.message}`);
}
