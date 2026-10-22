// Long edge of the photo we hand on: MAX_PHOTO_PX from lib/ai/config.ts (spec decision 26).
import { MAX_PHOTO_PX } from "@/lib/ai/config";

export const JPEG_QUALITY = 0.8;

/** A rectangle in the decoded photo's own pixels. */
export type CropRect = { x: number; y: number; width: number; height: number };

/** Decodes a picked file upright, applying the camera's EXIF rotation flag. */
export function decodePhoto(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/**
 * Crops, shrinks to MAX_PHOTO_PX and re-encodes as JPEG through a canvas.
 * A canvas export holds pixels only, so EXIF data (including GPS location) is dropped.
 */
export async function processPhoto(bitmap: ImageBitmap, crop: CropRect | null): Promise<File> {
  const src = crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const scale = Math.min(1, MAX_PHOTO_PX / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");

  // JPEG has no transparency; paint white so transparent PNG areas don't turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, src.x, src.y, src.width, src.height, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("JPEG encoding failed");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
