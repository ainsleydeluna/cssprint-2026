import Link from "next/link";
import { t } from "@/lib/strings";

export default function QuotesPage() {
  return (
    <section className="flex flex-col gap-4">
      {/* #11/#12 rebuild this page: keep this link, it is the way into shop setup. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("quotes", "title")}</h1>
        <Link href="/shop" className="btn btn-secondary shrink-0">
          {t("shop", "link")}
        </Link>
      </div>
      <p className="text-zinc-600 dark:text-zinc-400">Dito makikita ang mga nagawang quote. (Placeholder)</p>
    </section>
  );
}
