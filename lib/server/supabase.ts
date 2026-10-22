// Server-side Supabase client, from Supabase's Next.js setup. Uses the
// publishable key and the signed-in user's cookies, so row-level security
// applies to every query. Never import SUPABASE_SECRET_KEY into the app.

import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  return createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies. Safe to
          // ignore: proxy.ts refreshes the session on every request.
        }
      },
    },
  });
};
