import Link from "next/link";
import { t } from "@/lib/strings";
import { ShopForm } from "./_components/ShopForm";

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
      {/* A plain form post, so signing out works before the page's JavaScript loads. */}
      <form action="/auth/sign-out" method="post" className="mt-8">
        <button
          type="submit"
          className="min-h-12 w-full rounded-xl border border-zinc-300 px-4 font-semibold dark:border-zinc-700"
        >
          {t("shop", "signOut")}
        </button>
      </form>
    </section>
  );
}
