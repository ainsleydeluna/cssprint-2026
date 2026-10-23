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
      <summary className="btn btn-secondary w-full cursor-pointer list-none group-open:hidden [&::-webkit-details-marker]:hidden">
        {t("shop", "signOut")}
      </summary>
      <form action="/auth/sign-out" method="post" className="flex flex-col gap-3">
        <p className="text-lg font-semibold">{t("shop", "signOutConfirm")}</p>
        <button type="submit" className="btn btn-danger w-full">
          {t("shop", "signOutYes")}
        </button>
        <button
          type="button"
          onClick={() => details.current?.removeAttribute("open")}
          className="btn btn-secondary w-full"
        >
          {t("shop", "signOutNo")}
        </button>
      </form>
    </details>
  );
}
