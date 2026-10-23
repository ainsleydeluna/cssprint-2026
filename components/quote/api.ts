// The quote screens' only way to reach the server: one function per route in app/api,
// typed with lib/contract.ts. A failure throws ApiFailure; screens check its `code`, never the text.
// components/receipt/api.ts (#17) and the shop screens (#23) have the same small helper;
// share one once they are merged.
import type {
  ApiError,
  ApiErrorCode,
  CopiedRequest,
  CopiedResponse,
  CreateQuoteRequest,
  CreateQuoteResponse,
  DraftReplyResponse,
  PhotoKind,
  QuoteResponse,
  ShopResponse,
  StemListResponse,
  UpdateQuoteLinesRequest,
  UpdateQuoteLinesResponse,
  UploadPhotoResponse,
} from "@/lib/contract";
import type { Quote } from "@/lib/types";

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

export function uploadPhoto(photo: File, kind: PhotoKind) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("photo", photo);
  return call<UploadPhotoResponse>("/api/photos", { method: "POST", body: form });
}

// GET /api/quotes/[id] has no demo flag, so remember which quotes this tab created in demo mode.
const demoQuoteIds = new Set<string>();
export const createdInDemo = (quoteId: string) => demoQuoteIds.has(quoteId);

/** Runs analyzeBouquet on the photo and saves a draft quote. */
export const createQuote = (photoPath: string) =>
  call<CreateQuoteResponse>("/api/quotes", json("POST", { photoPath } satisfies CreateQuoteRequest)).then((created) => {
    if (created.demo) demoQuoteIds.add(created.quote.id);
    return created;
  });

const quoteUrl = (quoteId: string, rest = "") => `/api/quotes/${encodeURIComponent(quoteId)}${rest}`;

export const getQuote = (quoteId: string) => call<QuoteResponse>(quoteUrl(quoteId));

/** Drafts the reply from the saved lines (a draft quote keeps the text). Each call is a new AI call. */
export const draftReply = (quoteId: string) => call<DraftReplyResponse>(quoteUrl(quoteId, "/reply"), { method: "POST" });

/** Saves the florist's edited reply text (PATCH /api/quotes/[id]); the route answers the quote. */
export const updateReplyText = (quoteId: string, replyText: string) =>
  call<Quote>(quoteUrl(quoteId), json("PATCH", { replyText }));

/** After copying: the first copy sends the quote (sentAt, validUntil); later copies save the text. */
export const markCopied = (quoteId: string, replyText: string) =>
  call<CopiedResponse>(quoteUrl(quoteId, "/copied"), json("POST", { replyText } satisfies CopiedRequest));

export const getShop = () => call<ShopResponse>("/api/shop");

/** Every stem row, hidden ones included. */
export const listStems = () => call<StemListResponse>("/api/stems").then((r) => r.stems);

/** Replaces the whole recipe; the server reprices it. Lines without an id are new. */
export const updateLines = (quoteId: string, req: UpdateQuoteLinesRequest) =>
  call<UpdateQuoteLinesResponse>(quoteUrl(quoteId, "/lines"), json("PUT", req));
