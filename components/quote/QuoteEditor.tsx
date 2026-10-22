"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/receipt/kit";
import type { QuoteDetail, StemWithCost, UpdateQuoteLinesRequest } from "@/lib/contract";
import { COUNT_LIMITS, price, recipeCost } from "@/lib/money";
import { t } from "@/lib/strings";
import type { Shop } from "@/lib/types";
import { updateLines } from "./api";
import { type EditLine, QuoteLineRow } from "./QuoteLineRow";

const SAVE_DELAY_MS = 600;
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

type Props = { detail: QuoteDetail; shop: Shop; stems: StemWithCost[]; demo: boolean };
type SaveState = "saved" | "pending" | "saving" | "failed";

const toRequest = (lines: EditLine[]): UpdateQuoteLinesRequest => ({
  lines: lines.map(({ id, stemId, count, countLow, countHigh, confidence, note }) => ({
    ...(id ? { id } : {}),
    stemId, count, countLow, countHigh, confidence, note,
  })),
});

export function QuoteEditor({ detail, shop, stems, demo }: Props) {
  const quoteId = detail.quote.id;
  const [lines, setLines] = useState<EditLine[]>(() => detail.lines.map((l) => ({ ...l, key: l.id })));
  const [save, setSave] = useState<SaveState>("saved");
  // Refs for the autosave: the newest lines, the debounce timer, and one save in flight at a time.
  const latest = useRef(lines);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);

  async function flush() {
    timer.current = null;
    if (inFlight.current) return void (again.current = true);
    inFlight.current = true;
    const sent = latest.current;
    setSave("saving");
    try {
      const res = await updateLines(quoteId, toRequest(sent));
      // The route answers the lines in the order sent: new lines get their ids, and lines whose
      // stem didn't change since take the server's cost.
      const saved = new Map(sent.map((l, i) => [l.key, res.lines[i]]));
      const merged = latest.current.map((l) => {
        const s = saved.get(l.key);
        if (!s) return l;
        return { ...l, id: s.id, costPerStem: s.stemId === l.stemId ? s.costPerStem : l.costPerStem };
      });
      latest.current = merged;
      setLines(merged);
      setSave(again.current || timer.current ? "pending" : "saved");
    } catch {
      setSave("failed");
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        void flush();
      }
    }
  }

  function edit(next: EditLine[]) {
    latest.current = next;
    setLines(next);
    setSave("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }

  // Leaving the page with an edit still waiting: send it now.
  useEffect(() => {
    const pending = timer;
    const newest = latest;
    return () => {
      if (!pending.current) return;
      clearTimeout(pending.current);
      void updateLines(quoteId, toRequest(newest.current)).catch(() => {});
    };
  }, [quoteId]);

  const update = (key: string, patch: Partial<EditLine>) => edit(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  // A new line is a "pick a flower" line of 1, sure of itself once a flower is picked.
  const addLine = () =>
    edit([...lines, { key: crypto.randomUUID(), stemId: null, count: 1, countLow: 1, countHigh: 1, confidence: "high", note: "", costPerStem: 0 }]);

  const byId = new Map(stems.map((s) => [s.id, s]));
  const choices = (stemId: string | null) => stems.filter((s) => !s.hidden || s.id === stemId);
  const { cost, incomplete } = recipeCost(lines);
  const total = price(cost, shop);
  // Manual edits keep the per-line limits only; above the bouquet limit we warn instead of rescaling.
  const flowerStems = lines.reduce((n, l) => n + (l.stemId && !byId.get(l.stemId)?.isFiller ? (l.count ?? 0) : 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {demo && (
        <p className="self-start rounded-full bg-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          {t("common", "demo")}
        </p>
      )}
      <h2 className="text-lg font-semibold">{detail.quote.label}</h2>
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <QuoteLineRow
            key={line.key}
            line={line}
            stems={choices(line.stemId)}
            onChange={(patch) => update(line.key, patch)}
            onRemove={() => edit(lines.filter((l) => l.key !== line.key))}
          />
        ))}
      </ul>
      <Button variant="secondary" onClick={addLine}>
        {t("quote", "addLine")}
      </Button>

      {/* The total stays above the bottom bar (5rem + 1px border + home-indicator inset). */}
      <div className="sticky bottom-[calc(5rem+1px+env(safe-area-inset-bottom))] flex flex-col gap-1 border-t border-zinc-200 bg-white py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{t("quote", "total")}</span>
          <span className="text-2xl font-bold" data-testid="total">{peso.format(total)}</span>
        </div>
        {incomplete && <p className="text-sm text-amber-800 dark:text-amber-300">{t("quote", "incomplete")}</p>}
        {flowerStems > COUNT_LIMITS.stemsPerBouquet && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t("quote", "tooManyStems", { n: flowerStems, max: COUNT_LIMITS.stemsPerBouquet })}
          </p>
        )}
        <p role="status" className="flex min-h-6 items-center justify-between gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {save === "failed" ? (
            <>
              <span className="text-red-700 dark:text-red-400">{t("quote", "saveFailed")}</span>
              <button type="button" className="min-h-12 px-2 font-semibold text-green-800 dark:text-green-400" onClick={flush}>
                {t("common", "retry")}
              </button>
            </>
          ) : (
            t("quote", save === "saved" ? "saved" : "saving")
          )}
        </p>
      </div>
    </div>
  );
}
