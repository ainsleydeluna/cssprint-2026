"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listReceipts } from "./api";
import { formatDate, peso } from "./format";
import { Row } from "./kit";
import { receipts as t } from "./strings";
import type { ReceiptListItem } from "./types";

export function ReceiptList() {
  const [items, setItems] = useState<ReceiptListItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    listReceipts().then(setItems, () => setError(true));
  }, []);

  if (error) return <p role="alert" className="text-red-700 dark:text-red-400">{t.failed}</p>;
  if (!items) return <p role="status">{t.loading}</p>;
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p>{t.empty}</p>
        <Link href="/scan" className="flex min-h-12 items-center justify-center rounded-xl bg-green-800 px-4 font-semibold text-white">
          {t.scanFirst}
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((r) => (
        <Row key={r.id}>
          <Link href={`/receipts/${r.id}`} className="-m-3 flex min-h-12 items-center justify-between gap-3 p-3">
            <span>
              <span className="block font-medium">{formatDate(r.purchaseDate)}</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{t.lines(r.lineCount)}</span>
            </span>
            <span className="shrink-0 font-medium">{peso.format(r.totalPaid)}</span>
          </Link>
        </Row>
      ))}
    </ul>
  );
}
