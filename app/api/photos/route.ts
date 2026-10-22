import type { PhotoKind, UploadPhotoResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { uploadPhoto } from "@/lib/server/photos";

const KINDS: readonly PhotoKind[] = ["bouquets", "receipts"];

/** The buckets' file_size_limit (supabase/migrations). */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Every JPEG file starts with these bytes. */
function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// Multipart form: `kind` picks the bucket, `photo` is the cropped, shrunken JPEG.
export async function POST(request: Request) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("invalid_request", "Body must be a multipart form");
  }
  const kind = form.get("kind");
  const photo = form.get("photo");
  if (!KINDS.includes(kind as PhotoKind)) return errorResponse("invalid_request", "Invalid kind");
  if (!(photo instanceof Blob) || photo.size === 0 || photo.size > MAX_PHOTO_BYTES) {
    return errorResponse("invalid_request", "photo must be a JPEG of at most 5 MB");
  }
  if (!isJpeg(new Uint8Array(await photo.slice(0, 3).arrayBuffer()))) return errorResponse("invalid_request", "photo must be a JPEG");

  const photoPath = await uploadPhoto(session.supabase, session.shop.id, kind as PhotoKind, photo);
  return Response.json({ photoPath } satisfies UploadPhotoResponse);
}
