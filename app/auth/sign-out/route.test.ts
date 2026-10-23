// POST /auth/sign-out and the proxy, with a real test Shop A session on
// cssprint-dev. The session cookies live in a jar standing in for the browser.
// Skipped without the test-account keys.

import { signInTestShop, testAccountsReady } from "@/supabase/test-accounts";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { expect, test, vi } from "vitest";
import { proxy } from "@/proxy";
import { POST } from "./route";

const jar = vi.hoisted(() => new Map<string, string>());

/** The browser's cookie store: a cookie set empty or with maxAge 0 is removed. */
const store = {
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string, options?: { maxAge?: number }) => {
    if (value === "" || options?.maxAge === 0) jar.delete(name);
    else jar.set(name, value);
  },
};

vi.mock("next/headers", () => ({ cookies: async () => store }));

/** Opens `path` through the proxy with the jar's cookies. */
function open(path: string, method = "GET") {
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  return proxy(new NextRequest(`http://localhost${path}`, { method, headers: cookie ? { cookie } : {} }));
}

test.skipIf(!testAccountsReady)("after signing out, opening /quotes goes to /sign-in", { timeout: 30_000 }, async () => {
  // Sign in as the magic link would, leaving the session cookies in the jar.
  const { client } = await signInTestShop("A");
  const { data } = await client.auth.getSession();
  const ssr = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: store.getAll, setAll: (cookies) => cookies.forEach(({ name, value, options }) => store.set(name, value, options)) },
  });
  await ssr.auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token });
  expect(jar.size).toBeGreaterThan(0);
  expect((await open("/quotes")).headers.get("location")).toBeNull();

  const response = await POST(new NextRequest("http://localhost/auth/sign-out", { method: "POST" }));
  // 303: the browser follows with a GET, not a second POST.
  expect([response.status, response.headers.get("location")]).toEqual([303, "http://localhost/sign-in"]);
  expect(jar.size).toBe(0);

  const quotes = await open("/quotes");
  expect([quotes.status, quotes.headers.get("location")]).toEqual([307, "http://localhost/sign-in"]);
});

test("the proxy lets a signed-out sign-out post through to the route", async () => {
  jar.clear();
  const response = await open("/auth/sign-out", "POST");
  expect(response.headers.get("location")).toBeNull();
});
