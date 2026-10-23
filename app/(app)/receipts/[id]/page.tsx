import { Suspense } from "react";
import { ReceiptView } from "@/components/receipt/ReceiptView";
import { t } from "@/lib/strings";

// With Cache Components on, an unknown [id] is only known at request time,
// so reading it must sit inside <Suspense> (node_modules/next/dist/docs: dynamic-routes).
export default function ReceiptPage({ params }: PageProps<"/receipts/[id]">) {
  return (
    <section>
      <Suspense fallback={<p role="status">{t("receipts", "loading")}</p>}>
        {params.then(({ id }) => (
          <ReceiptView id={id} />
        ))}
      </Suspense>
    </section>
  );
}
