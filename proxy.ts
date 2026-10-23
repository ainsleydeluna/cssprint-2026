// Session proxy (Next.js 16 renamed middleware.ts to proxy.ts). Refreshes the
// Supabase session cookie on every request, from Supabase's Next.js setup, and
// sends signed-out visitors to the sign-in form. Route handlers under app/api
// check the session themselves and answer `unauthorized`.

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Pages a signed-out visitor may open. Sign-out is one: a second press, or one
 * after the session expired, should still clear the cookies and land on sign-in,
 * not be redirected as a POST.
 */
const PUBLIC_PAGES = ["/sign-in", "/sign-in/link-failed", "/auth/confirm", "/auth/sign-out"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // No-cache headers, so a CDN never serves one florist's session cookie to another.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Refreshes the session if it expired. getClaims also checks the token's signature.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) return response;
  if (!signedIn && !PUBLIC_PAGES.includes(pathname)) return redirect(request, response, "/sign-in");
  if (signedIn && pathname.startsWith("/sign-in")) return redirect(request, response, "/quotes");
  return response;
}

/** A redirect that keeps any session cookies the refresh just wrote. */
function redirect(request: NextRequest, refreshed: NextResponse, to: string) {
  const response = NextResponse.redirect(new URL(to, request.url));
  refreshed.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Everything except static files, image optimization, the app icons and the web app manifest.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
