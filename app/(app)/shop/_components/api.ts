// The shop screens' only way to reach the server: one function per route in app/api,
// typed with lib/contract.ts. A failure throws ApiFailure; screens check its `code`, never the text.
// components/receipt/api.ts (#17) has the same small helper; share one once both are merged.
import type {
  AddStemRequest,
  AddStemResponse,
  ApiError,
  ApiErrorCode,
  ShopResponse,
  StemListResponse,
  UpdateShopRequest,
  UpdateShopResponse,
  UpdateStemRequest,
  UpdateStemResponse,
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
  } catch {
    throw new ApiFailure(null, `Network error: ${url}`);
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

export const getShop = () => call<ShopResponse>("/api/shop");

export const updateShop = (req: UpdateShopRequest) => call<UpdateShopResponse>("/api/shop", json("PATCH", req));

/** Every stem row, hidden ones included. */
export const listStems = () => call<StemListResponse>("/api/stems").then((r) => r.stems);

export const addStem = (req: AddStemRequest) => call<AddStemResponse>("/api/stems", json("POST", req));

/** Edit a row, or hide it with { hidden: true }. Stems are never deleted. */
export const updateStem = (id: string, req: UpdateStemRequest) =>
  call<UpdateStemResponse>(`/api/stems/${encodeURIComponent(id)}`, json("PATCH", req));
