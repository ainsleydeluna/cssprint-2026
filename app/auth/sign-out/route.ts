import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server/supabase";

// The shop page's "Mag-sign out" form posts here, a plain form so it works
// before the page's JavaScript loads. Signs out this device only (other phones
// stay signed in), clears the session cookies and sends the florist to sign-in.
export async function POST(request: NextRequest) {
  // Only the app's own pages may sign the florist out: a form on another site
  // (or a post with no Origin) goes to the quotes and signs nothing out.
  if (request.headers.get("origin") !== request.nextUrl.origin) return redirect(request, "/quotes");

  const cookieStore = await cookies();
  const { error } = await createClient(cookieStore).auth.signOut({ scope: "local" });
  // Supabase answers an error without clearing the session when, say, the
  // session needs refreshing and Supabase cannot be reached. Delete its auth
  // cookies here (sb-…-auth-token and its chunks), so sign-out never quietly fails.
  if (error) {
    for (const { name } of cookieStore.getAll()) {
      if (name.startsWith("sb-") && name.includes("-auth-token")) cookieStore.delete(name);
    }
  }
  return redirect(request, "/sign-in");
}

function redirect(request: NextRequest, to: string) {
  // 303: the browser follows with a GET, not a second POST.
  const response = NextResponse.redirect(new URL(to, request.url), 303);
  // This response may clear the session cookie: never cache it.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
