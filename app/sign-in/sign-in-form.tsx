"use client";

import { useState, type FormEvent } from "react";
import type { ApiError, SignInRequest } from "@/lib/contract";
import { t } from "@/lib/strings";

type State = "idle" | "sending" | "sent" | "failed" | "rateLimited";

/** One email field (spec decision 1); after sending, a "check your email" state. */
export function SignInForm({ linkFailed }: { linkFailed: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function send(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email } satisfies SignInRequest),
    }).catch(() => null);
    if (response?.ok) return setState("sent");
    const answer: Partial<ApiError> | null = response ? await response.json().catch(() => null) : null;
    setState(answer?.code === "rate_limited" ? "rateLimited" : "failed");
  }

  if (state === "sent") {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t("signIn", "checkEmail")}</h1>
        <p className="text-base">{t("signIn", "sentTo", { email: email.trim() })}</p>
        <button type="button" onClick={() => setState("idle")} className="min-h-12 self-start text-base text-green-800 underline dark:text-green-400">
          {t("signIn", "useAnotherEmail")}
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("signIn", "title")}</h1>
      {linkFailed && state === "idle" && <p className="text-base text-red-700 dark:text-red-400">{t("signIn", "linkFailed")}</p>}
      <label className="flex flex-col gap-2 text-base">
        {t("signIn", "email")}
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-12 rounded-lg border border-neutral-400 px-3 text-base"
        />
      </label>
      {state === "failed" && <p className="text-base text-red-700 dark:text-red-400">{t("common", "error")}</p>}
      {state === "rateLimited" && <p className="text-base text-red-700 dark:text-red-400">{t("signIn", "rateLimited")}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="min-h-14 rounded-xl bg-green-800 px-4 text-lg font-semibold text-white disabled:opacity-60"
      >
        {state === "sending" ? t("signIn", "sending") : t("signIn", "send")}
      </button>
    </form>
  );
}
