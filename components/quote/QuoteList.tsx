"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/receipt/kit";
import type { QuoteListItem, QuoteListResponse } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { Quote, QuoteStatus } from "@/lib/types";
import { ApiFailure, deleteQuote, isUnauthorized, listQuotes, renameQuote } from "./api";
import { formatDuration } from "./duration";
import { peso } from "./format";
import { cleanLabel, showsUnderwater, underwaterCount, withoutQuote, withRenamed } from "./list";

const STATUS: Record<QuoteStatus, "statusDraft" | "statusSent" | "statusExpired"> = {
  draft: "statusDraft",
  sent: "statusSent",
  expired: "statusExpired",
};

const chip = "rounded-full px-2 py-0.5 text-xs font-semibold";

/** Every quote, newest first (the route's order), with rename and delete. */
export function QuoteList() {
  const router = useRouter();
  const [list, setList] = useState<QuoteListResponse | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Runs again each time the page is shown (Next hides it instead of unmounting), so a quote
  // sent or renamed elsewhere shows up to date.
  useEffect(() => {
    listQuotes().then(setList, (e) => {
      if (isUnauthorized(e)) return router.push("/sign-in");
      console.error(e);
      setList("error");
    });
  }, [attempt, router]);

  if (list === null) return <p role="status">{t("quotes", "loading")}</p>;
  if (list === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-red-700 dark:text-red-400">{t("common", "error")}</p>
        <Button onClick={() => (setList(null), setAttempt((n) => n + 1))}>{t("common", "retry")}</Button>
      </div>
    );
  }

  const { quotes, averageTimeToQuoteSeconds } = list;
  // Always from the newest list, so answers arriving out of order can't undo each other.
  const change = (next: (quotes: QuoteListItem[]) => QuoteListItem[]) =>
    setList((prev) => (prev && typeof prev === "object" ? { ...prev, quotes: next(prev.quotes) } : prev));
  const replace = (saved: Quote) => change((qs) => withRenamed(qs, saved));
  // The average is the route's; after a delete it is a little stale until the next load.
  const remove = (id: string) => change((qs) => withoutQuote(qs, id));
  const underwater = underwaterCount(quotes);

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p>{t("quotes", "empty")}</p>
        <Link href="/quotes/new" className="flex min-h-12 items-center justify-center rounded-xl bg-green-800 px-4 font-semibold text-white">
          {t("quotes", "newQuote")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {averageTimeToQuoteSeconds !== null && (
        <p className="font-medium">{t("quotes", "average", { time: formatDuration(averageTimeToQuoteSeconds) })}</p>
      )}
      {underwater > 0 && (
        <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-3 font-semibold text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
          {t("quotes", "underwaterBanner", { count: underwater })}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {quotes.map((q) => (
          <QuoteRow key={q.id} quote={q} onRenamed={replace} onDeleted={() => remove(q.id)} />
        ))}
      </ul>
    </div>
  );
}

type RowProps = { quote: QuoteListItem; onRenamed: (quote: Quote) => void; onDeleted: () => void };

function QuoteRow({ quote, onRenamed, onDeleted }: RowProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "rename" | "confirmDelete">("view");
  const [label, setLabel] = useState(quote.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(false);
    try {
      await task();
    } catch (e) {
      if (isUnauthorized(e)) return router.push("/sign-in");
      // Already gone (deleted on another phone): drop the row.
      if (e instanceof ApiFailure && e.code === "not_found") return onDeleted();
      console.error(e);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const newLabel = cleanLabel(label);
  const rename = () =>
    run(async () => {
      if (!newLabel) return;
      const saved = await renameQuote(quote.id, newLabel);
      onRenamed(saved);
      setMode("view");
    });
  const remove = () =>
    run(async () => {
      await deleteQuote(quote.id);
      onDeleted();
    });

  return (
    <li className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800">
      <Link href={`/quotes/${quote.id}`} className="flex flex-col gap-1 p-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`${chip} bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200`}>{t("quotes", STATUS[quote.status])}</span>
          {showsUnderwater(quote) && (
            <span className={`${chip} bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100`}>{t("quotes", "underwater")}</span>
          )}
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate font-semibold">{quote.label}</span>
          <span className="shrink-0 text-lg font-bold">{quote.price !== null ? peso(quote.price) : "—"}</span>
        </span>
        {quote.timeToQuoteSeconds !== null && (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("quotes", "timeToQuote", { time: formatDuration(quote.timeToQuoteSeconds) })}
          </span>
        )}
      </Link>

      <div className="flex flex-col gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        {mode === "view" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => (setLabel(quote.label), setMode("rename"))}>
              {t("quotes", "rename")}
            </Button>
            <Button variant="danger" onClick={() => setMode("confirmDelete")}>
              {t("quotes", "delete")}
            </Button>
          </div>
        )}
        {mode === "rename" && (
          <>
            <Input
              label={t("quotes", "renameLabel")}
              hint={t("quote", "renameHint")}
              value={label}
              // The route allows 80 characters (lib/server/fields.ts).
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={busy || !newLabel} onClick={rename}>{t("common", "save")}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setMode("view")}>{t("common", "cancel")}</Button>
            </div>
          </>
        )}
        {mode === "confirmDelete" && (
          <div role="alertdialog" aria-labelledby={`delete-${quote.id}`} className="flex flex-col gap-3">
            <p id={`delete-${quote.id}`} className="font-semibold">{t("quotes", "confirmTitle", { label: quote.label })}</p>
            <p className="text-sm">{t("quotes", "confirmBody")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger" disabled={busy} onClick={remove}>
                {busy ? t("quotes", "deleting") : t("quotes", "confirmYes")}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setMode("view")}>{t("common", "cancel")}</Button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t("common", "error")}</p>}
      </div>
    </li>
  );
}
