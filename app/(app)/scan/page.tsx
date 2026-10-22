import { ReceiptScan } from "@/components/receipt/ReceiptScan";
import { scan as t } from "@/components/receipt/strings";

export default function ScanReceiptPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <ReceiptScan />
    </section>
  );
}
