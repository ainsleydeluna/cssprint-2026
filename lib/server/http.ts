import { ERROR_STATUS, type ApiError, type ApiErrorCode } from "../contract";

/** A JSON error body, with the HTTP status lib/contract.ts sets for its code. */
export function errorResponse(code: ApiErrorCode, error: string): Response {
  return Response.json({ code, error } satisfies ApiError, { status: ERROR_STATUS[code] });
}
