import { cookies } from "next/headers";
import type { SignInResponse } from "@/lib/contract";
import { errorResponse, readJson } from "@/lib/server/http";
import { createClient } from "@/lib/server/supabase";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sends the magic link (spec decision 1). The link comes back to this
// request's own origin, so it works from localhost, a Vercel preview or the
// live site, as long as that origin is in Supabase's redirect URL list.
export async function POST(request: Request) {
  const body = await readJson(request);
  const email = typeof body === "object" && body !== null && "email" in body ? String(body.email).trim() : "";
  if (!EMAIL.test(email)) return errorResponse("invalid_request", "Enter an email address");

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${new URL(request.url).origin}/auth/confirm` },
  });
  // Supabase answers 429 (code over_email_send_rate_limit) when too many emails went out.
  if (error?.status === 429) return errorResponse("rate_limited", "Too many sign-in emails");
  if (error) throw new Error(`Sending the magic link failed: ${error.message}`);
  return Response.json({ sent: true } satisfies SignInResponse);
}
