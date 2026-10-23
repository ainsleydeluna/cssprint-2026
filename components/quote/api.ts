// The quote screens' only way to reach the server: one function per route in app/api,
// typed with lib/contract.ts. A failure throws ApiFailure; screens check its `code`, never the text.
// components/receipt/api.ts (#17) and the shop screens (#23) have the same small helper;
// share one once they are merged.
import type {
  ApiError,
  ApiErrorCode,
  CreateQuoteRequest,
  CreateQuoteResponse,
  PhotoKind,
  ShopResponse,
  StemListResponse,
  UpdateQuoteLinesRequest,
  UpdateQuoteLinesResponse,
  UploadPhotoResponse,
} from "@/lib/contract";
import type { DeleteQuoteResponse, QuoteListResponse, UpdateQuoteRequest, UpdateQuoteResponse } from "@/lib/contract";

export class ApiFailure extends Error {
  /** The contract's error code, or null when the call failed without one (offline, server crash). */
  constructor(
    readonly code: ApiErrorCode | null,
    message: string,
  ) {
    super(message);
  }
}

/** The session ended: send the florist to /sign-in. */
export const isUnauthorized = (e: unknown) => e instanceof ApiFailure && e.code === "unauthorized";

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
  throw new ApiFailure(body?.code ?? null, body?.error ?? `${res.status} ${url}`);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Newest first, each with its time-to-quote, and the shop average over sent quotes. */
export const listQuotes = () => call<QuoteListResponse>("/api/quotes");

export const renameQuote = (quoteId: string, label: string) =>
  call<UpdateQuoteResponse>(`/api/quotes/${encodeURIComponent(quoteId)}`, json("PATCH", { label } satisfies UpdateQuoteRequest));

/** Also deletes its photo and lines. */
export const deleteQuote = (quoteId: string) =>
  call<DeleteQuoteResponse>(`/api/quotes/${encodeURIComponent(quoteId)}`, { method: "DELETE" });

export function uploadPhoto(photo: File, kind: PhotoKind) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("photo", photo);
  return call<UploadPhotoResponse>("/api/photos", { method: "POST", body: form });
}

/** Runs analyzeBouquet on the photo and saves a draft quote. */
export const createQuote = (photoPath: string) =>
  call<CreateQuoteResponse>("/api/quotes", json("POST", { photoPath } satisfies CreateQuoteRequest));

export const getShop = () => call<ShopResponse>("/api/shop");

/** Every stem row, hidden ones included. */
export const listStems = () => call<StemListResponse>("/api/stems").then((r) => r.stems);

/** Replaces the whole recipe; the server reprices it. Lines without an id are new. */
export const updateLines = (quoteId: string, req: UpdateQuoteLinesRequest) =>
  call<UpdateQuoteLinesResponse>(`/api/quotes/${encodeURIComponent(quoteId)}/lines`, json("PUT", req));
