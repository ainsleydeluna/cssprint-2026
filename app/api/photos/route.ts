import type { UploadPhotoResponse } from "@/lib/contract";
import { uploadPhoto } from "@/lib/fake/responses";

// Stub: answers fake data until a backend ticket replaces it.
export async function POST() {
  return Response.json(uploadPhoto satisfies UploadPhotoResponse);
}
