"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiFailure, getAccuracy } from "@/app/(app)/_components/api";
import { Button } from "@/components/receipt/kit";
import { CALLS, MAX_PHOTO_PX } from "@/lib/ai/config";
import type { AccuracyResponse } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { AiCallName } from "@/lib/types";
import { PASS_MARKS, TESTED_CALLS, meetsMark, orDash, percent, usd, verdict, type Measure, type TestedCall } from "./accuracy";

type Loaded = { status: "loading" } | { status: "error" } | { status: "ready"; data: AccuracyResponse };

const callLabel = (call: AiCallName) => t("accuracy", call);
const seconds = (n: number) => t("accuracy", "seconds", { n: n.toFixed(1) });

function markText(measure: Measure): string {
  const mark = PASS_MARKS[measure];
  return "min" in mark ? `≥ ${percent(mark.min)}` : `< ${t("accuracy", "seconds", { n: mark.under })}`;
}

/** One measure: its name, pass mark if any, a sentence on what it means, and a small table. */
function MeasureTable({
  title,
  mark,
  help,
  firstHeader,
  rows,
}: {
  title: string;
  mark?: string;
  help: string;
  firstHeader: string;
  rows: Array<{ key: string; label: string; sub?: string; value: string; met?: boolean }>;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold">{title}</h3>
        {mark && <span className="text-sm text-zinc-600 dark:text-zinc-400">{t("accuracy", "passMark", { mark })}</span>}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{help}</p>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">{firstHeader}</th>
            <th scope="col">{t("accuracy", "result")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-zinc-200 dark:border-zinc-800">
              <th scope="row" className="py-2 pr-2 text-left font-normal break-all">
                {row.label}
                {row.sub && <span className="block text-zinc-500 dark:text-zinc-400">{row.sub}</span>}
              </th>
              <td className="py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                {row.value}
                {row.met !== undefined && (
                  <span
                    className={`ml-1 inline-block w-4 ${row.met ? "text-green-700 dark:text-green-400" : ""}`}
                    title={t("accuracy", row.met ? "met" : "missed")}
                  >
                    {row.met ? "✓" : ""}
                    <span className="sr-only">{t("accuracy", row.met ? "met" : "missed")}</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const BAKE_OFF_MEASURES: Measure[] = [
  "stemRowAccuracy",
  "countsWithin2",
  "totalsWithin10Percent",
  "receiptLineAccuracy",
  "medianSeconds",
];

function BakeOff({ results }: { results: AccuracyResponse["eval"] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{t("accuracy", "bakeOffTitle")}</h2>
      <p className="text-zinc-600 dark:text-zinc-400">{t("accuracy", "bakeOffIntro")}</p>

      <div className="flex flex-col gap-2 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900">
        <h3 className="font-semibold">{t("accuracy", "inUseTitle")}</h3>
        {(Object.keys(TESTED_CALLS) as TestedCall[]).map((call) => (
          <p key={call} className="text-sm">
            {t("accuracy", "inUse", { call: callLabel(call), model: CALLS[call].model, px: MAX_PHOTO_PX })}{" "}
            {t("accuracy", verdict(call, results, { model: CALLS[call].model, photoPx: MAX_PHOTO_PX }))}
          </p>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
          <p className="font-semibold">{t("accuracy", "noResults")}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("accuracy", "noResultsHint")}</p>
        </div>
      ) : (
        BAKE_OFF_MEASURES.map((measure) => (
          <MeasureTable
            key={measure}
            title={t("accuracy", measure)}
            mark={markText(measure)}
            help={t("accuracy", `${measure}Help`)}
            firstHeader={t("accuracy", "model")}
            rows={results.map((row) => ({
              key: `${row.model}-${row.photoPx}`,
              label: row.model,
              sub: t("accuracy", "photoPx", { px: row.photoPx }),
              value: measure === "medianSeconds" ? seconds(row[measure]) : percent(row[measure]),
              met: meetsMark(measure, row[measure]),
            }))}
          />
        ))
      )}
    </section>
  );
}

function Live({ live, averageCostPerQuoteUsd }: Omit<AccuracyResponse, "eval">) {
  const rows = (value: (row: AccuracyResponse["live"][number]) => string) =>
    live.map((row) => ({ key: row.call, label: callLabel(row.call), sub: row.call, value: value(row) }));
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{t("accuracy", "liveTitle")}</h2>
      <p className="text-zinc-600 dark:text-zinc-400">{t("accuracy", "liveCaption")}</p>
      {live.every((row) => row.calls === 0) ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
          {t("accuracy", "liveEmpty")}
        </p>
      ) : (
        <>
          <MeasureTable
            title={t("accuracy", "calls")}
            help={t("accuracy", "callsHelp")}
            firstHeader={t("accuracy", "call")}
            rows={rows((row) => row.calls.toLocaleString("en-US"))}
          />
          <MeasureTable
            title={t("accuracy", "medianSeconds")}
            help={t("accuracy", "liveMedianSecondsHelp")}
            firstHeader={t("accuracy", "call")}
            // medianSeconds becomes nullable in PR #45 (a call with no rows in the latest 1,000).
            rows={rows((row) => orDash(row.medianSeconds, seconds))}
          />
          <MeasureTable
            title={t("accuracy", "averageCost")}
            help={t("accuracy", "averageCostHelp")}
            firstHeader={t("accuracy", "call")}
            rows={rows((row) => usd(row.averageCostUsd))}
          />
        </>
      )}
      <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">{t("accuracy", "costPerQuote")}</h3>
          <span className="font-semibold tabular-nums">{usd(averageCostPerQuoteUsd)}</span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("accuracy", "costPerQuoteHelp")}</p>
      </section>
    </section>
  );
}

export function AccuracyView() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });

  const load = useCallback(() => {
    getAccuracy().then(
      (data) => setLoaded({ status: "ready", data }),
      (e: unknown) => {
        if (e instanceof ApiFailure && e.code === "unauthorized") return router.push("/sign-in");
        setLoaded({ status: "error" });
      },
    );
  }, [router]);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("accuracy", "title")}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t("accuracy", "intro")}</p>
      </div>
      {loaded.status === "loading" && <p role="status">{t("accuracy", "loading")}</p>}
      {loaded.status === "error" && (
        <div role="alert" className="flex flex-col gap-3">
          <p>{t("common", "error")}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setLoaded({ status: "loading" });
              load();
            }}
          >
            {t("common", "retry")}
          </Button>
        </div>
      )}
      {loaded.status === "ready" && (
        <>
          <BakeOff results={loaded.data.eval} />
          <Live live={loaded.data.live} averageCostPerQuoteUsd={loaded.data.averageCostPerQuoteUsd} />
        </>
      )}
    </div>
  );
}
