import Link from "next/link";
import { Suspense } from "react";
import { t } from "@/lib/strings";
import { PriceUpdateView } from "./_components/PriceUpdateView";

// With Cache Components on, an unknown [id] is only known at request time,
// so reading it must sit inside <Suspense> (node_modules/next/dist/docs: dynamic-routes).
export default function PriceUpdatePage({ params }: PageProps<"/quotes/[id]/price-update">) {
  return (
    <section>
      <Suspense
        fallback={
          <Link href="/quotes" className="btn btn-secondary self-start">
            {t("nav", "quotes")}
          </Link>
        }
      >
        {params.then(({ id }) => (
          <PriceUpdateView id={id} />
        ))}
      </Suspense>
    </section>
  );
}
