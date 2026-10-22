import { ERROR_STATUS, type ApiError, type ApiErrorCode } from "../contract";

/** A JSON error body, with the HTTP status lib/contract.ts sets for its code. */
export function errorResponse(code: ApiErrorCode, error: string): Response {
  return Response.json({ code, error } satisfies ApiError, { status: ERROR_STATUS[code] });
}

/** Row ids are UUIDs; anything else is not found, without asking the database. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres unique_violation; on stems, the shop already has a row with this name (stems_name_key). */
export const DUPLICATE_NAME = "23505";

/** The request's JSON body, or undefined when it is missing or not JSON (the parsers then answer invalid_request). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
