import { NewQuote } from "@/components/quote/NewQuote";
import { t } from "@/lib/strings";

export default function NewQuotePage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("newQuote", "title")}</h1>
      <NewQuote />
    </section>
  );
}
