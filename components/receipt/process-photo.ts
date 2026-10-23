// Long edge of the photo we hand on: MAX_PHOTO_PX from lib/ai/config.ts (spec decision 26).
import { MAX_PHOTO_PX } from "@/lib/ai/config";

export const JPEG_QUALITY = 0.8;

/**
 * Largest image we decode to cut a crop from. A phone photo decoded at full size
 * (4000 × 3000 = 48 MB of pixels, 8000 × 6000 = 192 MB) can run a phone tab out of memory.
 */
export const MAX_DECODE_PX = 2 * MAX_PHOTO_PX;

export type Size = { width: number; height: number };

/** A rectangle in pixels, or in fractions (0–1) of the upright photo for a crop box. */
export type CropRect = { x: number; y: number; width: number; height: number };

/** The size shrunk so its long edge is at most maxPx, never enlarged, never 0. */
export function fitWithin(size: Size, maxPx: number): Size {
  const scale = Math.min(1, maxPx / Math.max(size.width, size.height));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/**
 * How to make the output: decode the whole upright photo at `decode` size, cut `crop`
 * (decoded pixels) and draw it at `out`. The decode is just big enough for the crop to
 * reach maxPx, capped at maxDecodePx, so a small crop comes out smaller instead.
 */
export function outputPlan(size: Size, box: CropRect | null, maxPx: number, maxDecodePx: number) {
  const b = box ?? { x: 0, y: 0, width: 1, height: 1 };
  const cropLongEdge = Math.max(b.width * size.width, b.height * size.height);
  const scale = Math.min(1, maxPx / cropLongEdge, maxDecodePx / Math.max(size.width, size.height));
  const decode = { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
  const x = Math.min(decode.width - 1, Math.round(b.x * decode.width));
  const y = Math.min(decode.height - 1, Math.round(b.y * decode.height));
  const crop = {
    x,
    y,
    width: Math.max(1, Math.min(decode.width - x, Math.round(b.width * decode.width))),
    height: Math.max(1, Math.min(decode.height - y, Math.round(b.height * decode.height))),
  };
  return { decode, crop, out: fitWithin(crop, maxPx) };
}

/** Sizes to draw through when shrinking in halves: each step halves until the target is near, then lands on it. */
export function stepDownSizes(from: Size, to: Size): Size[] {
  const steps: Size[] = [];
  let { width, height } = from;
  while (width / 2 > to.width && height / 2 > to.height) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    steps.push({ width, height });
  }
  steps.push(to);
  return steps;
}

/**
 * The photo's upright width and height, read through an <img> that is never drawn,
 * so the browser reads the file header without decoding the pixels.
 */
export async function readSize(file: Blob): Promise<Size> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("The photo could not be read"));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes the photo upright (EXIF rotation applied) straight at `target` size, so the
 * full-size image is never made. Browsers without the resize options (before Chrome 54,
 * Firefox 98, Safari 15) ignore them and decode at full size: then shrink in halves.
 */
async function decodeAt(file: Blob, target: Size): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: "high",
  });
  if (bitmap.width === target.width && bitmap.height === target.height) return bitmap;
  // Options ignored: this is the full-size photo, so shrink it. Otherwise (e.g. resized
  // before the rotation, so the sides are swapped) decode again at full size.
  const sameShape = bitmap.width >= bitmap.height === target.width >= target.height;
  let full = bitmap;
  if (!sameShape || bitmap.width < target.width) {
    bitmap.close();
    full = await createImageBitmap(file, { imageOrientation: "from-image" });
  }
  try {
    return await stepDown(full, target);
  } finally {
    full.close();
  }
}

/** Shrinks in halves, freeing each step's canvas once the next is drawn. */
async function stepDown(full: ImageBitmap, target: Size): Promise<ImageBitmap> {
  let current: ImageBitmap | HTMLCanvasElement = full;
  for (const step of stepDownSizes(full, target)) {
    const canvas = document.createElement("canvas");
    canvas.width = step.width;
    canvas.height = step.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, step.width, step.height);
    if (current instanceof HTMLCanvasElement) current.width = 0;
    current = canvas;
  }
  const bitmap = await createImageBitmap(current);
  if (current instanceof HTMLCanvasElement) current.width = 0;
  return bitmap;
}

/** The photo upright, with its long edge at most longEdgePx, for the crop screen's preview. */
export const decodePreview = (file: Blob, size: Size, longEdgePx = 1600) => decodeAt(file, fitWithin(size, longEdgePx));

/**
 * Crops, shrinks to MAX_PHOTO_PX and re-encodes as JPEG through a canvas, decoding the
 * file again at only the size the crop needs. `box` is in fractions of the upright photo.
 * A canvas export holds pixels only, so EXIF data (including GPS location) is dropped.
 */
export async function processPhoto(file: Blob, size: Size, box: CropRect | null): Promise<File> {
  const { decode, crop, out } = outputPlan(size, box, MAX_PHOTO_PX, MAX_DECODE_PX);
  const bitmap = await decodeAt(file, decode);

  const canvas = document.createElement("canvas");
  canvas.width = out.width;
  canvas.height = out.height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available");
    // JPEG has no transparency; paint white so transparent PNG areas don't turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height);
  } finally {
    bitmap.close();
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  canvas.width = 0;
  if (!blob) throw new Error("JPEG encoding failed");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
