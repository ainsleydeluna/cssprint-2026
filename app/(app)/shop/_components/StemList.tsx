"use client";

import { useEffect, useState } from "react";
import { Button, Row } from "@/components/receipt/kit";
import { type AddStemRequest, type StemWithCost, stemName } from "@/lib/contract";
import { t } from "@/lib/strings";
import { addStem, listStems, updateStem } from "./api";
import { StemForm } from "./StemForm";
import { unitName } from "./units";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

export function StemList() {
  const [stems, setStems] = useState<StemWithCost[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /** The row being edited, or "new" for the add form. */
  const [editing, setEditing] = useState<string | null>(null);
  /** The stem whose hide or unhide just failed. */
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    listStems().then(setStems, () => setLoadFailed(true));
  }, []);

  if (!stems) {
    return loadFailed
      ? <p role="alert" className="text-red-700 dark:text-red-400">{t("common", "error")}</p>
      : <p role="status">{t("shop", "stemsLoading")}</p>;
  }

  const replace = (updated: StemWithCost) => setStems(stems.map((s) => (s.id === updated.id ? updated : s)));

  async function save(id: string | null, req: AddStemRequest) {
    if (id) replace(await updateStem(id, req));
    else setStems([...(stems ?? []), await addStem(req)]);
    setEditing(null);
  }

  async function setHidden(stem: StemWithCost, hidden: boolean) {
    setFailed(null);
    try {
      replace(await updateStem(stem.id, { hidden }));
    } catch {
      setFailed(stem.id);
    }
  }

  const row = (stem: StemWithCost) => (
    <Row key={stem.id}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{stemName(stem)}</span>
        <span className="shrink-0 text-right">
          {peso.format(stem.latestCost)} {t("shop", stem.isFiller ? "perBunch" : "perStem")}
        </span>
      </div>
      <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        {unitName(stem.unit)}
        {stem.unit === "bundle" && stem.bundleSize ? ` (${stem.bundleSize})` : ""}
        {stem.isSample && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">
            {t("common", "sample")}
          </span>
        )}
      </p>
      {editing === stem.id ? (
        <StemForm stem={stem} onSubmit={(req) => save(stem.id, req)} onCancel={() => setEditing(null)} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {stem.hidden ? (
            <Button variant="secondary" className="col-span-2" onClick={() => setHidden(stem, false)}>
              {t("shop", "unhide")}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setEditing(stem.id)}>
                {t("shop", "edit")}
              </Button>
              <Button variant="secondary" onClick={() => setHidden(stem, true)}>
                {t("shop", "hide")}
              </Button>
            </>
          )}
        </div>
      )}
      {failed === stem.id && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t("common", "error")}</p>}
    </Row>
  );

  const hidden = stems.filter((s) => s.hidden);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">{stems.filter((s) => !s.hidden).map(row)}</ul>

      {editing === "new" ? (
        <StemForm onSubmit={(req) => save(null, req)} onCancel={() => setEditing(null)} />
      ) : (
        <Button onClick={() => setEditing("new")}>{t("shop", "addStem")}</Button>
      )}

      {hidden.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t("shop", "hiddenTitle")}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("shop", "hiddenHint")}</p>
          <ul className="flex flex-col gap-2">{hidden.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
