import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server/supabase";

// The shop page's "Mag-sign out" form posts here, a plain form so it works
// before the page's JavaScript loads. Signs out this device only (other phones
// stay signed in), clears the session cookies and sends the florist to sign-in.
export async function POST(request: NextRequest) {
  const supabase = createClient(await cookies());
  // Already signed out answers an error; the cookies are cleared either way.
  await supabase.auth.signOut({ scope: "local" });
  // 303: the browser follows with a GET, not a second POST.
  const response = NextResponse.redirect(new URL("/sign-in", request.url), 303);
  // This response clears the session cookie: never cache it.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
