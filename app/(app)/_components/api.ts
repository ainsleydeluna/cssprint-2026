// The accuracy and price-update screens' only way to reach the server: one function per
// route in app/api, typed with lib/contract.ts. A failure throws ApiFailure; screens check
// its `code`, never the text. components/quote/api.ts and components/receipt/api.ts have
// the same small helper; share one once they are all merged.
import type {
  AccuracyResponse,
  ApiError,
  ApiErrorCode,
  ApplyPriceUpdateRequest,
  ApplyPriceUpdateResponse,
  PriceUpdateResponse,
} from "@/lib/contract";

export class ApiFailure extends Error {
  /** The contract's error code, or null when the call failed without one (offline, server crash). */
  constructor(
    readonly code: ApiErrorCode | null,
    message: string,
  ) {
    super(message);
  }
}

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

export const getAccuracy = () => call<AccuracyResponse>("/api/accuracy");

/** Drafts the message for an open, underwater quote. Saves nothing. */
export const draftPriceUpdate = (quoteId: string) =>
  call<PriceUpdateResponse>(`/api/quotes/${encodeURIComponent(quoteId)}/price-update`, { method: "POST" });

/** On copying: saves the draft's price, valid-until date and message on the quote. */
export const applyPriceUpdate = (quoteId: string, req: ApplyPriceUpdateRequest) =>
  call<ApplyPriceUpdateResponse>(`/api/quotes/${encodeURIComponent(quoteId)}/price-update/apply`, json("POST", req));
