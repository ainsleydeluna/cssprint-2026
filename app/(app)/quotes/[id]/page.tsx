import { Suspense } from "react";
import { QuoteScreen } from "@/components/quote/QuoteScreen";
import { t } from "@/lib/strings";

// With Cache Components on, an unknown [id] is only known at request time,
// so reading it must sit inside <Suspense> (node_modules/next/dist/docs: dynamic-routes).
export default function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  return (
    <section className="flex flex-col gap-4">
      <Suspense fallback={<p role="status">{t("quote", "loading")}</p>}>
        {/* key: a new quote starts fresh, not with the last one's step or lines. */}
        {params.then(({ id }) => (
          <QuoteScreen key={id} id={id} />
        ))}
      </Suspense>
    </section>
  );
}
