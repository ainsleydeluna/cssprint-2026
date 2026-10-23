// No "use client" here: onReply is a function, so this is rendered only from
// QuoteScreen (a Client Component), which makes it client code too.
import { useEffect, useState } from "react";
import { Button } from "@/components/receipt/kit";
import type { QuoteDetail, StemWithCost, UpdateQuoteLinesResponse } from "@/lib/contract";
import { COUNT_LIMITS, price, recipeCost } from "@/lib/money";
import { t } from "@/lib/strings";
import type { Quote, Shop } from "@/lib/types";
import { updateLines } from "./api";
import { Autosave, type SaveState } from "./autosave";
import { copyBlocker } from "./copy";
import { editLine, sendLines } from "./edit";
import { peso } from "./format";
import { type EditLine, QuoteLineRow } from "./QuoteLineRow";

const SAVE_DELAY_MS = 600;

type Props = {
  detail: QuoteDetail;
  shop: Shop;
  stems: StemWithCost[];
  demo: boolean;
  /** Opens the reply once every edit is saved, since the reply route drafts from the saved lines. */
  onReply: (lines: EditLine[]) => void;
  /** The quote from each lines-save answer: the server reprices it and clears its saved reply. */
  onSaved: (quote: Quote) => void;
};

/**
 * Folds a save's answer into the newest lines. The route answers the lines in the order sent:
 * new lines get their ids, and lines whose stem didn't change since take the server's cost.
 */
function merge(latest: EditLine[], sent: EditLine[], answer: UpdateQuoteLinesResponse): EditLine[] {
  const saved = new Map(sent.map((l, i) => [l.key, answer.lines[i]]));
  return latest.map((l) => {
    const s = saved.get(l.key);
    if (!s) return l;
    return { ...l, id: s.id, costPerStem: s.stemId === l.stemId ? s.costPerStem : l.costPerStem };
  });
}

export function QuoteEditor({ detail, shop, stems, demo, onReply, onSaved }: Props) {
  const quoteId = detail.quote.id;
  const [lines, setLines] = useState<EditLine[]>(() => detail.lines.map((l) => ({ ...l, key: l.id })));
  const [save, setSave] = useState<SaveState>("saved");
  const [opening, setOpening] = useState(false);
  // One autosave per quote: at most one save in flight; edits during it follow once it finishes.
  const [autosave] = useState(
    () =>
      new Autosave<EditLine[], UpdateQuoteLinesResponse>(lines, {
        delayMs: SAVE_DELAY_MS,
        // onSaved only ever sets QuoteScreen state from the newest state, so the first one is enough.
        send: sendLines((req) => updateLines(quoteId, req), onSaved),
        merge,
        onChange: (state, value) => {
          setSave(state);
          setLines(value);
        },
      }),
  );

  // Leaving the page with an edit still waiting: save it, after any save already running.
  useEffect(() => () => void autosave.flush(), [autosave]);

  const edit = (next: EditLine[]) => autosave.edit(next);
  const flush = () => void autosave.flush();

  async function openReply() {
    setOpening(true);
    await autosave.flush();
    setOpening(false);
    // A failed save shows "Hindi na-save…" with its retry; the reply waits for it.
    if (autosave.state() === "saved") onReply(autosave.value);
  }

  // An edited line is now checked by the florist: it saves as confidence "high", so it stays un-highlighted after a reload.
  const update = (key: string, patch: Partial<EditLine>) => edit(editLine(lines, key, patch));
  // A new line is a "pick a flower" line of 1, sure of itself once a flower is picked.
  const addLine = () =>
    edit([...lines, { key: crypto.randomUUID(), stemId: null, count: 1, countLow: 1, countHigh: 1, confidence: "high", note: "", costPerStem: 0 }]);

  const byId = new Map(stems.map((s) => [s.id, s]));
  const choices = (stemId: string | null) => stems.filter((s) => !s.hidden || s.id === stemId);
  const { cost } = recipeCost(lines);
  const blocker = copyBlocker(lines);
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
          <span className="text-2xl font-bold" data-testid="total">{peso(total)}</span>
        </div>
        {blocker && <p className="text-sm text-amber-800 dark:text-amber-300">{blocker}</p>}
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
        <Button disabled={!!blocker || opening} onClick={openReply}>
          {t("quote", "makeReply")}
        </Button>
      </div>
    </div>
  );
}
