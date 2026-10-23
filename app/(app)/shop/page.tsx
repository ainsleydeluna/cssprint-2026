import Link from "next/link";
import { t } from "@/lib/strings";
import { ShopForm } from "./_components/ShopForm";
import { SignOut } from "./_components/SignOut";

export default function ShopPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("shop", "title")}</h1>
      <Link
        href="/accuracy"
        className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 px-4 font-semibold dark:border-zinc-700"
      >
        {t("shop", "accuracyLink")}
      </Link>
      <Link
        href="/shop/stems"
        className="flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 px-4 font-semibold dark:border-zinc-700"
      >
        {t("shop", "stemsLink")}
      </Link>
      <ShopForm />
      <SignOut />
    </section>
  );
}
