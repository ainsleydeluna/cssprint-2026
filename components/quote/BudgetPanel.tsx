// No "use client" here: saveFirst and onChoose are functions, so this is rendered only from
// QuoteEditor inside QuoteScreen (a Client Component), which makes it client code too.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/receipt/kit";
import type { BudgetOption, BudgetOptionsResponse, StemWithCost } from "@/lib/contract";
import { t } from "@/lib/strings";
import { ApiFailure, budgetOptions, isUnauthorized } from "./api";
import {
  emptyOptionsMessage,
  fallbackNote,
  marginPercent,
  optionRecipe,
  optionToLines,
  overBudgetAmount,
  parseBudget,
  recipeKey,
} from "./budget";
import { peso } from "./format";
import type { EditLine } from "./QuoteLineRow";

type Props = {
  quoteId: string;
  /** The budget saved on the quote, if any. */
  initialBudget: number | null;
  /** The quote's price now (the editor's live total), to tell "already fits" from "none found". */
  price: number;
  /** The editor's lines now: options found for an older recipe are cleared. */
  lines: EditLine[];
  /** Every stem row, for the flowers on each option's card. */
  stems: StemWithCost[];
  /** True while a line has no flower or no count: the route would answer incomplete_quote. */
  blocked: boolean;
  /** Saves any pending edit, since the route reads the saved lines; false if that save failed. */
  saveFirst: () => Promise<boolean>;
  /** Replaces the recipe; the editor's autosave sends it to PUT …/lines. */
  onChoose: (lines: EditLine[]) => void;
};

export function BudgetPanel({ quoteId, initialBudget, price, lines, stems, blocked, saveFirst, onChoose }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialBudget?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  // The budget and recipe each answer was for, so editing the field doesn't change what an answer
  // says, and editing a line clears its options (they were priced for the old recipe).
  const [found, setFound] = useState<{ answer: BudgetOptionsResponse; budget: number; recipe: string } | null>(null);
  const result = found && found.recipe === recipeKey(lines) ? found : null;
  const [problem, setProblem] = useState<"error" | "incomplete" | null>(null);
  const budget = parseBudget(text);

  async function find() {
    if (budget === null) return;
    setBusy(true);
    setProblem(null);
    setFound(null);
    // The recipe as asked about; an edit after this makes the answer stale.
    const recipe = recipeKey(lines);
    try {
      // A failed save already shows "Hindi na-save…" with its retry in the editor.
      if (!(await saveFirst())) return;
      setFound({ answer: await budgetOptions(quoteId, budget), budget, recipe });
    } catch (e) {
      if (isUnauthorized(e)) return router.push("/sign-in");
      if (e instanceof ApiFailure && e.code === "incomplete_quote") return setProblem("incomplete");
      // ai_failed and anything else: the general error with "Subukan ulit".
      console.error(e);
      setProblem("error");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setFound(null);
    setProblem(null);
  }

  function choose(option: BudgetOption) {
    // Never replace newer edits with an option priced for an older recipe.
    if (!result) return;
    onChoose(optionToLines(option));
    close();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t("quote", "fitToBudget")}
      </Button>
    );
  }

  return (
    <section aria-label={t("quote", "fitToBudget")} className="flex flex-col gap-3 rounded-xl border border-zinc-300 p-3 dark:border-zinc-700">
      <Input
        label={t("quote", "budget")}
        inputMode="decimal"
        value={text}
        hint={text.trim() !== "" && budget === null ? t("quote", "budgetNeeded") : undefined}
        onChange={(e) => setText(e.target.value)}
      />
      {(blocked || problem === "incomplete") && (
        <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">{t("quote", "fixLinesFirst")}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy || budget === null || blocked} onClick={find}>
          {busy ? t("quote", "fitting") : t("quote", "findOptions")}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={close}>
          {t("common", "cancel")}
        </Button>
      </div>
      {problem === "error" && (
        <div role="alert" className="flex items-center justify-between gap-2 text-sm text-red-700 dark:text-red-400">
          <span>{t("common", "error")}</span>
          <button type="button" className="min-h-12 shrink-0 px-2 font-semibold text-green-800 dark:text-green-400" onClick={find}>
            {t("common", "retry")}
          </button>
        </div>
      )}

      {result && (
        <>
          {result.answer.demo && (
            <p className="self-start rounded-full bg-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              {t("common", "demo")}
            </p>
          )}
          {result.answer.options.length === 0 ? (
            <p className="text-sm">{emptyOptionsMessage(price, result.budget)}</p>
          ) : (
            <>
              {fallbackNote(result.answer.options, result.budget) && (
                <p className="text-sm font-semibold">{fallbackNote(result.answer.options, result.budget)}</p>
              )}
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("quote", "chooseHint")}</p>
              <ul className="flex flex-col gap-2">
                {result.answer.options.map((option, i) => (
                  <li key={i} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 font-semibold">{option.label}</span>
                      <span className="shrink-0 text-lg font-bold">{peso(option.price)}</span>
                    </div>
                    <p className="text-sm">{optionRecipe(option, stems)}</p>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {t("quote", "margin", { n: marginPercent(option.margin) })}
                    </span>
                    {option.overBudgetBy > 0 && (
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        {t("quote", "overBudgetBy", { amount: overBudgetAmount(option.overBudgetBy) })}
                      </p>
                    )}
                    <Button variant="secondary" onClick={() => choose(option)}>
                      {t("quote", "chooseOption")}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
