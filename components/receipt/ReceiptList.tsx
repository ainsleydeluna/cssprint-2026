"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReceiptListResponse } from "@/lib/contract";
import { t } from "@/lib/strings";
import { listReceipts } from "./api";
import { formatDate } from "./format";
import { Row } from "./kit";

export function ReceiptList() {
  const [items, setItems] = useState<ReceiptListResponse["receipts"] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    listReceipts().then(setItems, () => setError(true));
  }, []);

  if (error) return <p role="alert" className="text-red-700 dark:text-red-400">{t("common", "error")}</p>;
  if (!items) return <p role="status">{t("receipts", "loading")}</p>;
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p>{t("receipts", "empty")}</p>
        <Link href="/scan" className="btn btn-primary">
          {t("receipts", "scanFirst")}
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map(({ receipt, batches }) => (
        <Row key={receipt.id}>
          <Link href={`/receipts/${receipt.id}`} className="-m-3 flex min-h-12 items-center justify-between gap-3 p-3">
            <span className="font-medium">{formatDate(receipt.purchaseDate)}</span>
            <span className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">{t("receipts", "lines", { n: batches.length })}</span>
          </Link>
        </Row>
      ))}
    </ul>
  );
}
