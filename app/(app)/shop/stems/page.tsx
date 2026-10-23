import Link from "next/link";
import { t } from "@/lib/strings";
import { StemList } from "../_components/StemList";

export default function StemsPage() {
  return (
    <section className="flex flex-col gap-4">
      <Link href="/shop" className="flex min-h-12 items-center font-medium text-green-800 dark:text-green-400">
        {t("shop", "back")}
      </Link>
      <h1 className="text-2xl font-bold">{t("shop", "stemsTitle")}</h1>
      <StemList />
    </section>
  );
}
