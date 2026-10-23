import Link from "next/link";
import { ReceiptScan } from "@/components/receipt/ReceiptScan";
import { t } from "@/lib/strings";

export default function ScanReceiptPage() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("scan", "title")}</h1>
        <Link href="/receipts" className="btn btn-secondary shrink-0">
          {t("receipts", "link")}
        </Link>
      </div>
      <ReceiptScan />
    </section>
  );
}
