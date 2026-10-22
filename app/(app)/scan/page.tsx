import { ReceiptScan } from "@/components/receipt/ReceiptScan";
import { t } from "@/lib/strings";

export default function ScanReceiptPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("scan", "title")}</h1>
      <ReceiptScan />
    </section>
  );
}
