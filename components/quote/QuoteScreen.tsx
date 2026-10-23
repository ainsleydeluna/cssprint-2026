"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Row } from "@/components/receipt/kit";
import { type QuoteDetail, type StemWithCost, stemName } from "@/lib/contract";
import { manilaToday } from "@/lib/server/quote-rules";
import { t } from "@/lib/strings";
import type { Quote, Shop } from "@/lib/types";
import { ApiFailure, createdInDemo, getQuote, getShop, isUnauthorized, listStems } from "./api";
import { quoteLock } from "./copy";
import { peso } from "./format";
import { priceAtLatest } from "./price";
import { QuoteLockNotice } from "./QuoteLockNotice";
import { QuoteEditor } from "./QuoteEditor";
import type { EditLine } from "./QuoteLineRow";
import { ReplyPanel } from "./ReplyPanel";

type Loaded = { detail: QuoteDetail; shop: Shop; stems: StemWithCost[] };

/** A saved quote: its lines (editable while a draft, read-only once sent), then its reply. */
export function QuoteScreen({ id }: { id: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | "notFound" | "error" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<"lines" | "reply">("lines");
  const demo = createdInDemo(id);

  useEffect(() => {
    Promise.all([getQuote(id), getShop(), listStems()]).then(
      ([detail, shop, stems]) => setLoaded({ detail, shop, stems }),
      (e) => {
        if (isUnauthorized(e)) return router.push("/sign-in");
        console.error(e);
        setLoaded(e instanceof ApiFailure && e.code === "not_found" ? "notFound" : "error");
      },
    );
  }, [id, attempt, router]);

  const header = (
    <Link href="/quotes" className="btn btn-secondary self-start">
      {t("quote", "back")}
    </Link>
  );

  if (loaded === null) return <div className="flex flex-col gap-4">{header}<p role="status">{t("quote", "loading")}</p></div>;
  if (loaded === "notFound") return <div className="flex flex-col gap-4">{header}<p>{t("quote", "notFound")}</p></div>;
  if (loaded === "error") {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p role="alert" className="text-red-700 dark:text-red-400">{t("common", "error")}</p>
        <Button onClick={() => (setLoaded(null), setAttempt((n) => n + 1))}>{t("common", "retry")}</Button>
      </div>
    );
  }

  const { detail, shop, stems } = loaded;
  // Always from the newest state: a save answering late must not undo a newer change.
  const update = (change: (detail: QuoteDetail) => QuoteDetail) =>
    setLoaded((prev) => (prev && typeof prev === "object" ? { ...prev, detail: change(prev.detail) } : prev));
  const setQuote = (quote: Quote) => update((d) => ({ ...d, quote }));
  // The reply text as the florist left it, so coming back shows it without a new AI draft.
  const setReplyText = (replyText: string) => update((d) => ({ ...d, quote: { ...d.quote, replyText } }));
  // The editor's saved lines, so going back to them from the reply keeps every edit.
  const keepLines = (lines: EditLine[]) =>
    update((d) => ({ ...d, lines: lines.map(({ key, ...l }) => ({ ...l, id: l.id ?? key, quoteId: id, shopId: d.quote.shopId })) }));

  if (step === "reply") {
    return (
      <ReplyPanel
        detail={detail}
        demo={demo}
        newPrice={priceAtLatest(detail.lines, stems, shop)}
        onBack={() => setStep("lines")}
        onCopied={setQuote}
        onText={setReplyText}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      {detail.quote.status === "draft" ? (
        <QuoteEditor
          detail={detail}
          shop={shop}
          stems={stems}
          demo={demo}
          onSaved={setQuote}
          onReply={(lines) => {
            keepLines(lines);
            setStep("reply");
          }}
        />
      ) : (
        <SentLines detail={detail} shop={shop} stems={stems} onReply={() => setStep("reply")} />
      )}
    </div>
  );
}

type SentProps = { detail: QuoteDetail; shop: Shop; stems: StemWithCost[]; onReply: () => void };

/** A sent or expired quote: the customer has its price, so its lines no longer change. */
function SentLines({ detail, shop, stems, onReply }: SentProps) {
  const { quote, lines } = detail;
  const byId = new Map(stems.map((s) => [s.id, s]));
  const lock = quoteLock(quote, manilaToday(new Date()));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{quote.label}</h2>
        <span className="rounded-full bg-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          {t("quotes", quote.status === "expired" ? "statusExpired" : "statusSent")}
        </span>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("quote", "readOnly")}</p>
      <QuoteLockNotice quoteId={quote.id} lock={lock} newPrice={lock?.kind === "underwater" ? priceAtLatest(lines, stems, shop) : null} />
      <ul className="flex flex-col gap-2">
        {lines.map((line) => {
          const stem = line.stemId ? byId.get(line.stemId) : undefined;
          return (
            <Row key={line.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{stem ? stemName(stem) : line.stemId}</span>
                <span className="shrink-0">
                  {line.count} {t("quote", stem?.isFiller ? "countBunches" : "countStems")}
                </span>
              </div>
            </Row>
          );
        })}
      </ul>
      <div className="sticky bottom-[calc(5rem+1px+env(safe-area-inset-bottom))] flex flex-col gap-2 border-t border-dashed border-ink/30 bg-background py-3">
        {quote.price !== null && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{t("quote", "total")}</span>
            <span className="text-2xl font-bold">{peso(quote.price)}</span>
          </div>
        )}
        <Button onClick={onReply}>{t("quote", "openReply")}</Button>
      </div>
    </div>
  );
}
