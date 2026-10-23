"use client";

import { useRef } from "react";
import { t } from "@/lib/strings";

/**
 * Sign-out with a confirm step and no browser dialog. The first tap opens the
 * <details>; only "Oo, mag-sign out" posts the form. Both work before the
 * page's JavaScript loads; "Huwag na" closes the step once it has loaded.
 */
export function SignOut() {
  const details = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={details} className="group mt-8">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center rounded-xl border border-zinc-300 px-4 font-semibold group-open:hidden dark:border-zinc-700 [&::-webkit-details-marker]:hidden">
        {t("shop", "signOut")}
      </summary>
      <form action="/auth/sign-out" method="post" className="flex flex-col gap-3">
        <p className="text-lg font-semibold">{t("shop", "signOutConfirm")}</p>
        <button type="submit" className="min-h-12 rounded-xl bg-red-700 px-4 font-semibold text-white">
          {t("shop", "signOutYes")}
        </button>
        <button
          type="button"
          onClick={() => details.current?.removeAttribute("open")}
          className="min-h-12 rounded-xl border border-zinc-300 px-4 font-semibold dark:border-zinc-700"
        >
          {t("shop", "signOutNo")}
        </button>
      </form>
    </details>
  );
}
