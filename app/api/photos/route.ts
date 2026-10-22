import type { PhotoKind, UploadPhotoResponse } from "@/lib/contract";
import { requireShop } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { uploadPhoto } from "@/lib/server/photos";

const KINDS: readonly PhotoKind[] = ["bouquets", "receipts"];

/** The buckets' file_size_limit (supabase/migrations storage). */
const MAX_BYTES = 5 * 1024 * 1024;

// Multipart form: `kind` and `photo`, the cropped, shrunken JPEG. Answers its storage path.
export async function POST(request: Request) {
  const session = await requireShop();
  if (session instanceof Response) return session;
  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind");
  const photo = form?.get("photo");
  if (!KINDS.includes(kind as PhotoKind)) return errorResponse("invalid_request", "Invalid kind");
  if (!(photo instanceof Blob) || photo.size === 0 || photo.size > MAX_BYTES) {
    return errorResponse("invalid_request", "Invalid photo");
  }

  const photoPath = await uploadPhoto(session.supabase, session.shop.id, kind as PhotoKind, photo);
  return Response.json({ photoPath } satisfies UploadPhotoResponse);
}
