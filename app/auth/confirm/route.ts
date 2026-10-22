import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import starter from "@/fixtures/seed/stems.json";
import { createClient } from "@/lib/server/supabase";

/** Shop setup (Pat's T7 screen), where a florist lands after the first sign-in. */
const SHOP_SETUP_PATH = "/shop";

// The magic link lands here. A token_hash link is verified on the server, so
// it works when a phone opens it in its email app's own browser; a code link
// (Supabase's default email template) only works in the browser that asked for it.
// The first sign-in creates the shop with the starter list (spec decision 14).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = createClient(await cookies());
  const { error } =
    tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { error: new Error("The link has no token") };
  if (error) return redirect(request, "/sign-in/link-failed");

  const created = await supabase.rpc("create_shop", { starter });
  if (created.error) throw new Error(`Creating the shop failed: ${created.error.message}`);
  return redirect(request, created.data ? SHOP_SETUP_PATH : "/quotes");
}

function redirect(request: NextRequest, to: string) {
  const response = NextResponse.redirect(new URL(to, request.url));
  // This response sets the session cookie: never cache it.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
