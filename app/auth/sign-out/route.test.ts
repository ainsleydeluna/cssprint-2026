// POST /auth/sign-out and the proxy, with a real test Shop A session on
// cssprint-dev. The session cookies live in a jar standing in for the browser.
// Skipped without the test-account keys.

import { signInTestShop, testAccountsReady } from "@/supabase/test-accounts";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
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
  delete: (name: string) => jar.delete(name),
};

vi.mock("next/headers", () => ({ cookies: async () => store }));

/** Opens `path` through the proxy with the jar's cookies. */
function open(path: string, method = "GET") {
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  return proxy(new NextRequest(`http://localhost${path}`, { method, headers: cookie ? { cookie } : {} }));
}

/** The shop page's form post, from the app's own address unless `origin` says otherwise. */
function signOut(origin: string | null = "http://localhost") {
  return POST(new NextRequest("http://localhost/auth/sign-out", { method: "POST", headers: origin ? { origin } : {} }));
}

/** Signs in as the magic link would, leaving the session cookies in the jar. */
async function signIn() {
  const { client } = await signInTestShop("A");
  const { data } = await client.auth.getSession();
  const ssr = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: store.getAll, setAll: (cookies) => cookies.forEach(({ name, value, options }) => store.set(name, value, options)) },
  });
  await ssr.auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token });
  expect(jar.size).toBeGreaterThan(0);
  expect((await open("/quotes")).headers.get("location")).toBeNull();
}

beforeEach(() => {
  jar.clear();
  vi.restoreAllMocks();
});

describe.skipIf(!testAccountsReady)("signed in", { timeout: 30_000 }, () => {
  test("after signing out, opening /quotes goes to /sign-in", async () => {
    await signIn();
    const response = await signOut();
    // 303: the browser follows with a GET, not a second POST.
    expect([response.status, response.headers.get("location")]).toEqual([303, "http://localhost/sign-in"]);
    expect(jar.size).toBe(0);

    const quotes = await open("/quotes");
    expect([quotes.status, quotes.headers.get("location")]).toEqual([307, "http://localhost/sign-in"]);
  });

  // auth-js retries the refresh for about 25 seconds before it gives up.
  test("when Supabase's sign-out fails, the auth cookies are deleted anyway", { timeout: 60_000 }, async () => {
    await signIn();
    jar.set("theme", "dark");
    // The session has expired and Supabase cannot be reached to refresh it: signOut
    // answers that error before removing anything, which would leave the session cookies.
    const [name, value] = [...jar].find(([key]) => key.endsWith("-auth-token"))!;
    const session = JSON.parse(Buffer.from(value.slice("base64-".length), "base64url").toString());
    session.expires_at = Math.floor(Date.now() / 1000) - 60;
    jar.set(name, `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`);
    const offline = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const response = await signOut();
    expect(offline).toHaveBeenCalled();
    vi.restoreAllMocks();

    expect([response.status, response.headers.get("location")]).toEqual([303, "http://localhost/sign-in"]);
    expect([...jar.keys()]).toEqual(["theme"]);
    expect((await open("/quotes")).headers.get("location")).toBe("http://localhost/sign-in");
  });

  test.each([
    ["another site's page", "https://evil.example"],
    ["no page at all", null],
  ])("a post from %s goes to /quotes and signs nothing out", async (_case, origin) => {
    await signIn();
    const before = new Map(jar);
    const response = await signOut(origin);
    expect([response.status, response.headers.get("location")]).toEqual([303, "http://localhost/quotes"]);
    expect(jar).toEqual(before);
    expect((await open("/quotes")).headers.get("location")).toBeNull();
  });
});

// The proxy builds a Supabase client, so it needs the project keys too.
test.skipIf(!testAccountsReady)("the proxy lets a signed-out sign-out post through to the route", async () => {
  const response = await open("/auth/sign-out", "POST");
  expect(response.headers.get("location")).toBeNull();
});
