import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { createShop } from "@/lib/server/auth";
import { createClient } from "@/lib/server/supabase";

/**
 * Where a florist lands after the first sign-in. Spec decision 14 says shop
 * setup; set this to "/shop" when Pat's T7 screen merges. Until then /shop is a 404.
 */
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

  // The florist is signed in either way. If creating the shop fails here,
  // requireShop creates it on their next request.
  const created = await createShop(supabase).catch((reason: unknown) => {
    console.error(reason instanceof Error ? reason.message : reason);
    return false;
  });
  return redirect(request, created ? SHOP_SETUP_PATH : "/quotes");
}

function redirect(request: NextRequest, to: string) {
  const response = NextResponse.redirect(new URL(to, request.url));
  // This response sets the session cookie: never cache it.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
