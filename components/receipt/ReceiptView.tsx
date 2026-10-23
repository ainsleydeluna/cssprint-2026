"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type StemWithCost, stemName } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { Receipt, StockBatch } from "@/lib/types";
import { ApiFailure, deleteReceipt, listReceipts, listStems } from "./api";
import { formatDate, peso } from "./format";
import { Button, Row } from "./kit";

type Loaded = { receipt: Receipt; batches: StockBatch[]; stems: Map<string, StemWithCost> };
/** After a delete: how many open quotes it turned underwater, or "gone" if it was already deleted. */
type Deleted = { underwater: number } | "gone";

/** A saved receipt: read-only (spec decision 28). Fixing one means delete and scan again. */
export function ReceiptView({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // No single-receipt route: find it in the list. Stems include hidden rows, so old lines keep their names.
    Promise.all([listReceipts(), listStems()]).then(([receipts, stems]) => {
      const found = receipts.find((r) => r.receipt.id === id);
      setLoaded(found ? { ...found, stems: new Map(stems.map((s) => [s.id, s])) } : null);
    }, () => setError(true));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    setError(false);
    try {
      const { underwaterQuoteIds } = await deleteReceipt(id);
      setDeleted({ underwater: underwaterQuoteIds.length });
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "not_found") setDeleted("gone");
      else setError(true);
    } finally {
      setDeleting(false);
    }
  }

  const back = (
    <Link href="/receipts" className="btn btn-secondary self-start">
      {t("receipts", "back")}
    </Link>
  );
  const errorText = <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t("common", "error")}</p>;

  if (deleted) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        {deleted !== "gone" && deleted.underwater > 0 && (
          <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-3 font-semibold text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
            {t("quotes", "underwaterBanner", { count: deleted.underwater })}
          </p>
        )}
        <p role="status">{deleted === "gone" ? t("receipts", "alreadyGone") : t("receipts", "deleted")}</p>
      </div>
    );
  }
  if (loaded === undefined) return <>{back}{error ? errorText : <p role="status">{t("receipts", "loading")}</p>}</>;
  if (loaded === null) return <>{back}<p role="alert">{t("receipts", "notFound")}</p></>;

  return (
    <div className="flex flex-col gap-4">
      {back}
      <h1 className="text-2xl font-bold">{formatDate(loaded.receipt.purchaseDate)}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("receipts", "readOnly")}</p>

      <ul className="flex flex-col gap-2">
        {loaded.batches.map((b) => {
          const stem = loaded.stems.get(b.stemId);
          return (
            <Row key={b.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{stem ? stemName(stem) : b.stemId}</span>
                <span className="shrink-0">{peso.format(b.totalPaid)}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <span>
                  {b.quantity} × {t("units", b.unit)}
                  {b.unit === "bundle" && b.bundleSize ? ` (${b.bundleSize})` : ""}
                </span>
                <span>
                  {peso.format(b.costPerStem)} {stem?.isFiller ? t("scan", "perBunch") : t("scan", "perStem")}
                </span>
              </div>
            </Row>
          );
        })}
      </ul>

      {confirming ? (
        <div role="alertdialog" aria-labelledby="confirm-title" className="flex flex-col gap-3 rounded-xl border border-red-300 p-3 dark:border-red-800">
          <p id="confirm-title" className="font-semibold">{t("receipts", "confirmTitle")}</p>
          <p className="text-sm">{t("receipts", "confirmBody")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? t("receipts", "deleting") : t("receipts", "confirmYes")}
            </Button>
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirming(false)}>
              {t("common", "cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {t("receipts", "delete")}
        </Button>
      )}
      {error && errorText}
    </div>
  );
}
