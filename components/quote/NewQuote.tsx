"use client";

import { useState } from "react";
import { PhotoPicker } from "@/components/receipt/PhotoPicker";
import type { CreateQuoteResponse, StemWithCost } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { Shop } from "@/lib/types";
import { createQuote, getShop, listStems, uploadPhoto } from "./api";
import { QuoteEditor } from "./QuoteEditor";

type State =
  | { step: "pick" }
  | { step: "working"; message: string }
  | { step: "edit"; created: CreateQuoteResponse; shop: Shop; stems: StemWithCost[] };

export function NewQuote() {
  const [state, setState] = useState<State>({ step: "pick" });
  const [error, setError] = useState(false);

  async function handlePhoto(photo: File) {
    setError(false);
    setState({ step: "working", message: t("newQuote", "uploading") });
    try {
      const { photoPath } = await uploadPhoto(photo, "bouquets");
      setState({ step: "working", message: t("newQuote", "analyzing") });
      const [created, shop, stems] = await Promise.all([createQuote(photoPath), getShop(), listStems()]);
      setState({ step: "edit", created, shop, stems });
    } catch {
      setError(true);
      setState({ step: "pick" });
    }
  }

  if (state.step === "working") return <p role="status" className="py-8 text-center">{state.message}</p>;

  if (state.step === "edit") {
    const { created, shop, stems } = state;
    return <QuoteEditor detail={created} shop={shop} stems={stems} demo={created.demo} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* "both", not camera only: customers' bouquet photos usually arrive in Messenger, so they're in the gallery. */}
      <PhotoPicker source="both" onPhoto={handlePhoto} />
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t("common", "error")}</p>}
    </div>
  );
}
