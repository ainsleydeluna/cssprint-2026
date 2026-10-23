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

/** The crop box (fractions of the upright photo) in its pixels, kept inside the photo, at least 1 px. */
export function cropInPixels(size: Size, box: CropRect): CropRect {
  const x = Math.min(size.width - 1, Math.round(box.x * size.width));
  const y = Math.min(size.height - 1, Math.round(box.y * size.height));
  return {
    x,
    y,
    width: Math.max(1, Math.min(size.width - x, Math.round(box.width * size.width))),
    height: Math.max(1, Math.min(size.height - y, Math.round(box.height * size.height))),
  };
}

/**
 * The JPEG with an EXIF segment holding only its orientation, right after the start marker
 * (big-endian TIFF, one entry: tag 0x0112, SHORT). Builds the crop-order probe below.
 */
export function withOrientation(jpeg: Uint8Array, orientation: number): Uint8Array<ArrayBuffer> {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]; // "Exif\0\0"
  const length = payload.length + 2;
  // SOI (2) + APP1 marker (2) + length (2) + payload, then the photo after its own SOI.
  const out = new Uint8Array(6 + payload.length + jpeg.length - 2);
  out.set([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...payload]);
  out.set(jpeg.subarray(2), 6 + payload.length);
  return out;
}

/**
 * The EXIF orientation (1–8) in a JPEG's header, or 1 (upright) when there is none, the
 * header is cut off, or the file isn't a JPEG. Only the first segments are read.
 */
export function readOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    // Start of the image data (or its end): no EXIF came before it.
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = view.getUint16(at + 2);
    const isExif = marker === 0xe1 && at + 10 <= bytes.length && view.getUint32(at + 4) === 0x45786966 && view.getUint16(at + 8) === 0;
    if (isExif && at + 2 + length <= bytes.length) return tiffOrientation(view, at + 10, at + 2 + length) ?? 1;
    at += 2 + length;
  }
  return 1;
}

/** The Orientation tag (0x0112) of a TIFF block's first IFD, or null. */
function tiffOrientation(view: DataView, start: number, end: number): number | null {
  if (start + 8 > end) return null;
  const order = view.getUint16(start);
  const little = order === 0x4949;
  if (!little && order !== 0x4d4d) return null;
  const ifd = start + view.getUint32(start + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return null;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** The photo's EXIF orientation, from its first 128 KB (EXIF sits at the start). */
const orientationOf = async (file: Blob) => readOrientation(new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer()));

let cropUpright: Promise<boolean> | null = null;

/**
 * Whether this browser measures createImageBitmap's crop rectangle on the upright photo, as
 * the HTML spec says. Checked once: a 32 × 16 JPEG (left red, right blue) flagged "rotate 90°
 * clockwise" is 16 × 32 upright, blue in the bottom half, so cropping that half must give blue.
 * Any other answer (or an error) keeps the whole-photo decode.
 */
export function cropMeasuredUpright(): Promise<boolean> {
  cropUpright ??= (async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 16;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(16, 0, 16, 16);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
      if (!blob) return false;
      const probe = new Blob([withOrientation(new Uint8Array(await blob.arrayBuffer()), 6)], { type: "image/jpeg" });
      const bottom = await createImageBitmap(probe, 0, 16, 16, 16, { imageOrientation: "from-image" });
      const check = document.createElement("canvas");
      check.width = 1;
      check.height = 1;
      const pixel = check.getContext("2d", { willReadFrequently: true });
      if (!pixel) return false;
      pixel.drawImage(bottom, 8, 8, 1, 1, 0, 0, 1, 1);
      bottom.close();
      const [red, , blue] = pixel.getImageData(0, 0, 1, 1).data;
      return blue > 128 && red < 128;
    } catch (e) {
      console.error("Crop-order check failed; using the whole-photo decode", e);
      return false;
    }
  })();
  return cropUpright;
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
 * Crop-based decode: only the cropped area, upright, straight at its output size, so a small
 * crop keeps full detail (up to MAX_PHOTO_PX) and nothing else is held. A photo with no rotation
 * flag crops the same everywhere; a rotated one only where the browser passes
 * cropMeasuredUpright (Chrome 156 swaps the ends of a rotated photo's crop). Null otherwise,
 * or when the browser can't resize while decoding.
 */
async function decodeCrop(file: Blob, size: Size, box: CropRect): Promise<ImageBitmap | null> {
  if ((await orientationOf(file)) !== 1 && !(await cropMeasuredUpright())) return null;
  const src = cropInPixels(size, box);
  const out = fitWithin(src, MAX_PHOTO_PX);
  const bitmap = await createImageBitmap(file, src.x, src.y, src.width, src.height, {
    imageOrientation: "from-image",
    resizeWidth: out.width,
    resizeHeight: out.height,
    resizeQuality: "high",
  });
  if (bitmap.width === out.width && bitmap.height === out.height) return bitmap;
  // Resize ignored: this is the crop at full size, so shrink it in halves.
  try {
    return bitmap.width >= out.width && bitmap.height >= out.height ? await stepDown(bitmap, out) : null;
  } finally {
    bitmap.close();
  }
}

/**
 * Crops, shrinks to MAX_PHOTO_PX and re-encodes as JPEG through a canvas, decoding the file
 * again at only the size needed: just the crop where the browser allows (decodeCrop), else
 * the whole photo at reduced size. `box` is in fractions of the upright photo.
 * A canvas export holds pixels only, so EXIF data (including GPS location) is dropped.
 */
export async function processPhoto(file: Blob, size: Size, box: CropRect | null): Promise<File> {
  const cropped = box ? await decodeCrop(file, size, box) : null;
  const plan = cropped
    ? {
        crop: { x: 0, y: 0, width: cropped.width, height: cropped.height },
        out: { width: cropped.width, height: cropped.height },
      }
    : outputPlan(size, box, MAX_PHOTO_PX, MAX_DECODE_PX);
  const bitmap = cropped ?? (await decodeAt(file, (plan as ReturnType<typeof outputPlan>).decode));
  const { crop, out } = plan;

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
