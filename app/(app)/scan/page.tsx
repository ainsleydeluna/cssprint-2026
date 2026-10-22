import Link from "next/link";
import { ReceiptScan } from "@/components/receipt/ReceiptScan";
import { receipts } from "@/components/receipt/strings";
import { t } from "@/lib/strings";

export default function ScanReceiptPage() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("scan", "title")}</h1>
        <Link href="/receipts" className="flex min-h-12 shrink-0 items-center font-medium text-green-800 dark:text-green-400">
          {receipts.link}
        </Link>
      </div>
      <ReceiptScan />
    </section>
  );
}
