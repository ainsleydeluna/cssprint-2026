import type { ApiError } from "../contract";

/** A JSON error body with its HTTP status. */
export function errorResponse(status: number, error: string): Response {
  return Response.json({ error } satisfies ApiError, { status });
}
