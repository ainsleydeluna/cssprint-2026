"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteReceipt, getReceipt } from "./api";
import { formatDate, peso } from "./format";
import { Button, Row } from "./kit";
import { stemName } from "./ReceiptTable";
import { receipts as t, scan, units } from "./strings";
import type { ReceiptDetail } from "./types";

/** A saved receipt: read-only (spec decision 28). Fixing one means delete and scan again. */
export function ReceiptView({ id }: { id: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ReceiptDetail | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getReceipt(id).then(setDetail, () => setError(true));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    setError(false);
    try {
      await deleteReceipt(id);
      router.replace("/receipts");
    } catch {
      setError(true);
      setDeleting(false);
    }
  }

  const back = (
    <Link href="/receipts" className="flex min-h-12 items-center font-medium text-green-800 dark:text-green-400">
      {t.back}
    </Link>
  );

  if (detail === undefined && !error) return <>{back}<p role="status">{t.loading}</p></>;
  if (!detail) return <>{back}<p role="alert">{error ? t.failed : t.notFound}</p></>;

  const stems = new Map(detail.stems.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-4">
      {back}
      <h1 className="text-2xl font-bold">{formatDate(detail.receipt.purchaseDate)}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.readOnly}</p>

      <ul className="flex flex-col gap-2">
        {detail.batches.map((b) => {
          const stem = stems.get(b.stemId);
          return (
            <Row key={b.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{stem ? stemName(stem) : b.stemId}</span>
                <span className="shrink-0">{peso.format(b.totalPaid)}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                <span>
                  {b.quantity} × {units[b.unit]}
                  {b.unit === "bundle" && b.bundleSize ? ` (${b.bundleSize})` : ""}
                </span>
                <span>
                  {peso.format(b.costPerStem)} {stem?.isFiller ? scan.perBunch : scan.perStem}
                </span>
              </div>
            </Row>
          );
        })}
      </ul>

      {confirming ? (
        <div role="alertdialog" aria-labelledby="confirm-title" className="flex flex-col gap-3 rounded-xl border border-red-300 p-3 dark:border-red-800">
          <p id="confirm-title" className="font-semibold">{t.confirmTitle}</p>
          <p className="text-sm">{t.confirmBody}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" disabled={deleting} onClick={handleDelete}>
              {deleting ? t.deleting : t.confirmYes}
            </Button>
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirming(false)}>
              {t.confirmNo}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {t.delete}
        </Button>
      )}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t.failed}</p>}
    </div>
  );
}
