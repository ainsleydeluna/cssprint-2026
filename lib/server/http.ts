import { ERROR_STATUS, type ApiError, type ApiErrorCode } from "../contract";

/** A JSON error body, with the HTTP status lib/contract.ts sets for its code. */
export function errorResponse(code: ApiErrorCode, error: string): Response {
  return Response.json({ code, error } satisfies ApiError, { status: ERROR_STATUS[code] });
}

/**
 * Postgres unique_violation. On stems, the shop already has a row with this name
 * (stems_name_key); on receipts, the photo is already saved (receipts_photo_path_key).
 */
export const DUPLICATE_NAME = "23505";

/** The request's JSON body, or undefined when it is missing or not JSON (the parsers then answer invalid_request). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
