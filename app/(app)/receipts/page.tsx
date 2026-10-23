import { ReceiptList } from "@/components/receipt/ReceiptList";
import { t } from "@/lib/strings";

export default function ReceiptsPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("receipts", "title")}</h1>
      <ReceiptList />
    </section>
  );
}
