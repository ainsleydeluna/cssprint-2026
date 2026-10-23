import { Button, Row, Select } from "@/components/receipt/kit";
import { type StemWithCost, stemName } from "@/lib/contract";
import { clampCount } from "@/lib/money";
import { t } from "@/lib/strings";
import type { QuoteLine } from "@/lib/types";
import { lineTone } from "./edit";

/** A quote line while editing: `key` is local; `id` is missing until the server saves a new line. */
export type EditLine = Omit<QuoteLine, "id" | "quoteId" | "shopId"> & { key: string; id?: string };

type Props = {
  line: EditLine;
  /** Rows the florist can pick from: visible ones, plus this line's own stem if it is hidden. */
  stems: StemWithCost[];
  onChange: (patch: Partial<EditLine>) => void;
  onRemove: () => void;
};

export function QuoteLineRow({ line, stems, onChange, onRemove }: Props) {
  const stem = stems.find((s) => s.id === line.stemId);
  const isFiller = stem?.isFiller ?? false;
  const unsure = line.confidence !== "high";

  function swap(stemId: string) {
    const next = stems.find((s) => s.id === stemId);
    if (!next) return onChange({ stemId: null, costPerStem: 0 });
    // The line takes the new row's latest cost; a count moves into that row's limits (fillers 1–5 bunches).
    onChange({
      stemId: next.id,
      costPerStem: next.latestCost,
      count: line.count === null ? null : clampCount(line.count, next.isFiller),
    });
  }

  const setCount = (text: string) =>
    onChange({ count: text.trim() === "" || Number.isNaN(Number(text)) ? null : clampCount(Number(text), isFiller) });
  const step = (by: number) => onChange({ count: clampCount((line.count ?? 0) + by, isFiller) });

  return (
    <Row tone={lineTone(line)}>
      <Select
        label={line.stemId ? t("quote", "stem") : t("quote", "pickFlower")}
        value={line.stemId ?? ""}
        onChange={(e) => swap(e.target.value)}
      >
        <option value="">{t("quote", "pickFlower")}</option>
        {stems.map((s) => (
          <option key={s.id} value={s.id}>
            {stemName(s)}
          </option>
        ))}
      </Select>

      {(unsure || line.note) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          {unsure && (
            <span className="rounded-full bg-lavender px-2 py-0.5 text-xs font-semibold text-[#4a2f4a]">
              {t("quote", "unsure")}
            </span>
          )}
          {line.note}
        </p>
      )}

      {/* A group, not a <label>: a label wrapping the − button would press it when its text is tapped. */}
      <div role="group" aria-labelledby={`${line.key}-count`} className="flex flex-col gap-1 text-sm">
        <span id={`${line.key}-count`} className="font-medium">
          {t("quote", isFiller ? "countBunches" : "countStems")}
        </span>
        <div className="grid grid-cols-[3rem_1fr_3rem] gap-2">
          <Button variant="secondary" aria-label={t("quote", "less")} disabled={line.count !== null && line.count <= 1} onClick={() => step(-1)}>
            −
          </Button>
          <input
            aria-labelledby={`${line.key}-count`}
            inputMode="numeric"
            className="min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 text-center text-base dark:border-zinc-700 dark:bg-zinc-950"
            placeholder={t("quote", "blankCount")}
            value={line.count ?? ""}
            onChange={(e) => setCount(e.target.value)}
          />
          <Button variant="secondary" aria-label={t("quote", "more")} onClick={() => step(1)}>
            +
          </Button>
        </div>
        {line.countLow !== line.countHigh && (
          <span className="text-zinc-500 dark:text-zinc-400">{t("quote", "range", { low: line.countLow, high: line.countHigh })}</span>
        )}
      </div>

      <Button variant="danger" onClick={onRemove}>
        {t("quote", "remove")}
      </Button>
    </Row>
  );
}
