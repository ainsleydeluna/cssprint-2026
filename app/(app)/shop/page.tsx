import Link from "next/link";
import { t } from "@/lib/strings";
import { ShopForm } from "./_components/ShopForm";
import { SignOut } from "./_components/SignOut";

export default function ShopPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("shop", "title")}</h1>
      <Link href="/accuracy" className="btn btn-secondary w-full">
        {t("shop", "accuracyLink")}
      </Link>
      <Link href="/shop/stems" className="btn btn-secondary w-full">
        {t("shop", "stemsLink")}
      </Link>
      <ShopForm />
      <SignOut />
    </section>
  );
}
