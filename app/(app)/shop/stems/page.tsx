import Link from "next/link";
import { t } from "@/lib/strings";
import { StemList } from "../_components/StemList";

export default function StemsPage() {
  return (
    <section className="flex flex-col gap-4">
      <Link href="/shop" className="btn btn-secondary self-start">
        {t("shop", "back")}
      </Link>
      <h1 className="text-2xl font-bold">{t("shop", "stemsTitle")}</h1>
      <StemList />
    </section>
  );
}
