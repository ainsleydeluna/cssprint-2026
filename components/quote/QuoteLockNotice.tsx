import Link from "next/link";
import { t } from "@/lib/strings";
import type { QuoteLock } from "./copy";
import { peso } from "./format";

/**
 * Why an expired or underwater quote can't be copied, and the way on: a new quote, or the
 * price update at the new price (Ice's /quotes/[id]/price-update page).
 */
export function QuoteLockNotice({ quoteId, lock, newPrice }: { quoteId: string; lock: QuoteLock | null; newPrice: number | null }) {
  if (!lock) return null;
  const link = "flex min-h-12 items-center justify-center rounded-xl bg-green-800 px-4 font-semibold text-white";
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-amber-400 bg-amber-50 p-3 text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
      {lock.kind === "expired" ? (
        <>
          <p className="font-semibold">{lock.reason}</p>
          <Link href="/quotes/new" className={link}>{t("nav", "newQuote")}</Link>
        </>
      ) : (
        <>
          <p className="font-semibold">{t("quote", "underwater")}</p>
          {newPrice !== null && <p className="text-lg font-bold">{t("quote", "newPrice", { price: peso(newPrice) })}</p>}
          <p className="text-sm">{lock.reason}</p>
          <Link href={`/quotes/${quoteId}/price-update`} className={link}>{t("quote", "draftPriceUpdate")}</Link>
        </>
      )}
    </div>
  );
}
