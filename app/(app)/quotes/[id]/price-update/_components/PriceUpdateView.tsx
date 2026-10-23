"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { applyPriceUpdate, draftPriceUpdate } from "@/app/(app)/_components/api";
import { formatDate } from "@/components/receipt/format";
import { Button } from "@/components/receipt/kit";
import type { ApplyPriceUpdateResponse, PriceUpdateResponse } from "@/lib/contract";
import { t } from "@/lib/strings";
import { copyThenApply, problemFor, wholePesos, type Problem } from "./price-update";

type Step =
  | { name: "start" }
  | { name: "drafting" }
  | { name: "draft"; draft: PriceUpdateResponse; message: string; copying: boolean }
  /** stillUnderwater: the server saved the price but kept the flag, because costs rose again since the draft. */
  | { name: "done"; draft: PriceUpdateResponse; stillUnderwater: boolean };

/** A problem the screen shows: from the server, or from copying on this phone. */
type Shown = Exclude<Problem, { kind: "signIn" }> | { kind: "missingPrice" } | { kind: "clipboard" };

function problemText(shown: Shown, step: Step): string {
  switch (shown.kind) {
    case "retry":
      return t("common", "error");
    case "message":
      return shown.text;
    case "clipboard":
      return t("priceUpdate", "clipboardFailed");
    case "missingPrice":
      return t("priceUpdate", "missingPrice", { price: step.name === "draft" ? wholePesos(step.draft.newPrice) : "" });
  }
}

const linkStyles = "flex min-h-12 items-center font-medium text-green-800 dark:text-green-400";

function Prices({ draft }: { draft: PriceUpdateResponse }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      <dt className="text-zinc-600 dark:text-zinc-400">{t("priceUpdate", "oldPrice")}</dt>
      <dd className="text-right tabular-nums line-through">{wholePesos(draft.oldPrice)}</dd>
      <dt className="text-zinc-600 dark:text-zinc-400">{t("priceUpdate", "newPrice")}</dt>
      <dd className="text-right text-lg font-bold tabular-nums">{wholePesos(draft.newPrice)}</dd>
      <dt className="text-zinc-600 dark:text-zinc-400">{t("priceUpdate", "validUntil")}</dt>
      <dd className="text-right">{formatDate(draft.validUntil)}</dd>
    </dl>
  );
}

export function PriceUpdateView({ id }: { id: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "start" });
  // `retry` names the action behind "Subukan ulit"; copying again uses the message as it is now.
  const [problem, setProblem] = useState<{ shown: Shown; retry: "draft" | "copy" } | null>(null);

  /** Sends a signed-out florist to sign-in; otherwise shows the problem. */
  function fail(e: unknown, retry: "draft" | "copy") {
    const p = problemFor(e);
    if (p.kind === "signIn") return router.push("/sign-in");
    setProblem({ shown: p, retry });
  }

  async function draft() {
    setProblem(null);
    setStep({ name: "drafting" });
    try {
      const answer = await draftPriceUpdate(id);
      setStep({ name: "draft", draft: answer, message: answer.message, copying: false });
    } catch (e) {
      setStep({ name: "start" });
      fail(e, "draft");
    }
  }

  async function copy(current: Extract<Step, { name: "draft" }>) {
    setProblem(null);
    setStep({ ...current, copying: true });
    let saved: ApplyPriceUpdateResponse | undefined;
    try {
      const result = await copyThenApply(
        {
          writeClipboard: (text) => navigator.clipboard.writeText(text),
          apply: async (req) => void (saved = await applyPriceUpdate(id, req)),
        },
        current.draft,
        current.message,
      );
      if (result.ok) return setStep({ name: "done", draft: current.draft, stillUnderwater: saved?.underwaterAt != null });
      setStep(current);
      setProblem({ shown: { kind: result.failed }, retry: "copy" });
    } catch (e) {
      setStep(current);
      fail(e, "copy");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/quotes/${encodeURIComponent(id)}`} className={`${linkStyles} self-start`}>
        {t("priceUpdate", "back")}
      </Link>
      <h1 className="text-2xl font-bold">{t("priceUpdate", "title")}</h1>

      {(step.name === "start" || step.name === "drafting") && (
        <>
          <p className="text-zinc-600 dark:text-zinc-400">{t("priceUpdate", "intro")}</p>
          <Button onClick={draft} disabled={step.name === "drafting"}>
            {step.name === "drafting" ? t("priceUpdate", "drafting") : t("quote", "draftPriceUpdate")}
          </Button>
        </>
      )}

      {step.name === "draft" && (
        <>
          {step.draft.demo && (
            <span className="self-start rounded-full bg-amber-100 px-2 text-sm font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100">
              {t("common", "demo")}
            </span>
          )}
          <Prices draft={step.draft} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("priceUpdate", "message")}</span>
            <textarea
              value={step.message}
              onChange={(e) => setStep({ ...step, message: e.target.value })}
              rows={8}
              readOnly={step.copying}
              className="w-full min-w-0 rounded-xl border border-zinc-300 bg-white p-3 text-base dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <Button onClick={() => copy(step)} disabled={step.copying}>
            {step.copying ? t("priceUpdate", "copying") : t("priceUpdate", "copy")}
          </Button>
        </>
      )}

      {problem && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-300 p-3 text-red-800 dark:border-red-800 dark:text-red-300">
          <p>{problemText(problem.shown, step)}</p>
          {problem.shown.kind === "retry" && (
            <Button
              variant="secondary"
              onClick={() => (problem.retry === "draft" ? draft() : step.name === "draft" && copy(step))}
            >
              {t("common", "retry")}
            </Button>
          )}
        </div>
      )}

      {step.name === "done" && (
        <>
          <p role="status" className="rounded-xl bg-green-50 p-3 text-green-900 dark:bg-green-950 dark:text-green-100">
            {t("priceUpdate", "done", { price: wholePesos(step.draft.newPrice), date: formatDate(step.draft.validUntil) })}
          </p>
          {step.stillUnderwater && (
            <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100">
              {t("priceUpdate", "stillUnderwater")}
            </p>
          )}
          <Link
            href={`/quotes/${encodeURIComponent(id)}`}
            className="flex min-h-12 items-center justify-center rounded-xl bg-green-800 px-4 font-semibold text-white"
          >
            {t("priceUpdate", "backToQuote")}
          </Link>
        </>
      )}
    </div>
  );
}
