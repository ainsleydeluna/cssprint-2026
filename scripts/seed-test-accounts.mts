// Creates the two test accounts for the Shop A / Shop B test
// (supabase/shop-isolation.test.ts), once, on cssprint-dev (spec decision 24).
// Safe to run again: an account that already exists only gets its password reset.
//
// Reads from .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// TEST_SHOP_A_EMAIL, TEST_SHOP_B_EMAIL and TEST_ACCOUNTS_PASSWORD.
// SUPABASE_SECRET_KEY lives only in Ice's .env.local: never NEXT_PUBLIC_, never
// committed, not in Vercel. Creating confirmed accounts needs it; this script
// never prints it.
//
// Run from the repo root: node --env-file=.env.local scripts/seed-test-accounts.mts

import { createClient } from "@supabase/supabase-js";

const names = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "TEST_SHOP_A_EMAIL",
  "TEST_SHOP_B_EMAIL",
  "TEST_ACCOUNTS_PASSWORD",
] as const;

const missing = names.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}

const [url, secretKey, emailA, emailB, password] = names.map((name) => process.env[name] ?? "");
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

for (const email of [emailA, emailB]) {
  // email_confirm: the account can sign in with its password without a magic link.
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error) console.log(`Created ${email}`);
  else if (error.code === "email_exists" || error.code === "user_already_exists") {
    // Reset the password so the test still signs in after TEST_ACCOUNTS_PASSWORD changes.
    const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listed.error) {
      console.error(`${email} already exists, but listing users to reset its password failed: ${listed.error.message}`);
      process.exit(1);
    }
    const user = listed.data.users.find((u) => u.email === email.toLowerCase());
    const reset = user && (await admin.auth.admin.updateUserById(user.id, { password }));
    if (reset && !reset.error) console.log(`${email} already exists; password reset`);
    else {
      console.error(`${email} already exists but its password could not be reset`);
      process.exitCode = 1;
    }
  } else {
    console.error(`Could not create ${email}: ${error.message}`);
    process.exitCode = 1;
  }
}
