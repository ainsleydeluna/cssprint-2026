import Link from "next/link";
import { QuoteList } from "@/components/quote/QuoteList";
import { t } from "@/lib/strings";

export default function QuotesPage() {
  return (
    <section className="flex flex-col gap-4">
      {/* Keep this link: it is the way into shop setup. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("quotes", "title")}</h1>
        <Link href="/shop" className="btn btn-secondary shrink-0">
          {t("shop", "link")}
        </Link>
      </div>
      <QuoteList />
    </section>
  );
}
