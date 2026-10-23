// The receipt screens' only way to reach the server: one function per route in app/api,
// typed with lib/contract.ts. A failure throws ApiFailure; screens check its `code`, never the text.
import type {
  AddStemRequest,
  AddStemResponse,
  ApiError,
  ApiErrorCode,
  DeleteReceiptResponse,
  ExtractReceiptRequest,
  ExtractReceiptResponse,
  PhotoKind,
  ReceiptListResponse,
  SaveReceiptRequest,
  SaveReceiptResponse,
  StemListResponse,
  UploadPhotoResponse,
} from "@/lib/contract";

export class ApiFailure extends Error {
  constructor(
    /** The contract's error code, or null when the call failed without one (offline, server crash). */
    readonly code: ApiErrorCode | null,
    message: string,
    /** The HTTP status, or null when there was no answer at all. */
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/**
 * The session ended: send the florist to /sign-in. Checks the 401 status because the
 * "unauthorized" code is only on main so far; switch to the code once main is merged.
 */
export const isUnauthorized = (e: unknown) => e instanceof ApiFailure && e.status === 401;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    // Keep the browser's own reason (e.g. "TypeError: Failed to fetch") for the console.
    throw new ApiFailure(null, `Network error: ${url} (${e})`);
  }
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
  throw new ApiFailure(body?.code ?? null, body?.error ?? `${res.status} ${url}`, res.status);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function uploadPhoto(photo: File, kind: PhotoKind) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("photo", photo);
  return call<UploadPhotoResponse>("/api/photos", { method: "POST", body: form });
}

export const extractReceipt = (photoPath: string) =>
  call<ExtractReceiptResponse>("/api/receipts/extract", json("POST", { photoPath } satisfies ExtractReceiptRequest));

/** Every stem row, hidden ones included. */
export const listStems = () => call<StemListResponse>("/api/stems").then((r) => r.stems);

export const addStem = (req: AddStemRequest) => call<AddStemResponse>("/api/stems", json("POST", req));

export const saveReceipt = (req: SaveReceiptRequest) => call<SaveReceiptResponse>("/api/receipts", json("POST", req));

/** Newest purchase date first. There is no single-receipt route, so a receipt's screen reads this list. */
export const listReceipts = () => call<ReceiptListResponse>("/api/receipts").then((r) => r.receipts);

/** Also deletes the photo and batches. Throws ApiFailure "not_found" when it is already gone. */
export const deleteReceipt = (id: string) =>
  call<DeleteReceiptResponse>(`/api/receipts/${encodeURIComponent(id)}`, { method: "DELETE" });
