// POST /api/auth/sign-in with Supabase Auth replaced, so no email is sent.

import { beforeEach, expect, test, vi } from "vitest";
import { POST } from "./route";

const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@/lib/server/supabase", () => ({ createClient: () => ({ auth }) }));

function signIn(email: string) {
  return POST(new Request("https://preview.example.app/api/auth/sign-in", { method: "POST", body: JSON.stringify({ email }) }));
}

beforeEach(() => auth.signInWithOtp.mockReset());

test("sends a magic link that returns to the address the form was opened on", async () => {
  auth.signInWithOtp.mockResolvedValue({ error: null });
  const response = await signIn(" florist@example.com ");
  expect([response.status, await response.json()]).toEqual([200, { sent: true }]);
  expect(auth.signInWithOtp).toHaveBeenCalledWith({
    email: "florist@example.com",
    options: { emailRedirectTo: "https://preview.example.app/auth/confirm" },
  });
});

test("answers 429 rate_limited when Supabase's email rate limit is hit", async () => {
  auth.signInWithOtp.mockResolvedValue({
    error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
  });
  const response = await signIn("florist@example.com");
  expect([response.status, (await response.json()).code]).toEqual([429, "rate_limited"]);
});

test("answers 400 invalid_request for a malformed email without calling Supabase", async () => {
  const response = await signIn("not-an-email");
  expect([response.status, (await response.json()).code]).toEqual([400, "invalid_request"]);
  expect(auth.signInWithOtp).not.toHaveBeenCalled();
});
