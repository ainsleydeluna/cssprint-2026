"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { PhotoPicker } from "@/components/receipt/PhotoPicker";
import { t } from "@/lib/strings";
import { createQuote, isUnauthorized, uploadPhoto } from "./api";

type State = { step: "pick" } | { step: "working"; message: string };

export function NewQuote() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "pick" });
  const [error, setError] = useState(false);

  // Next keeps this page mounted but hidden after leaving it; start fresh when it comes back.
  useLayoutEffect(
    () => () => {
      setState({ step: "pick" });
      setError(false);
    },
    [],
  );

  async function handlePhoto(photo: File) {
    setError(false);
    setState({ step: "working", message: t("newQuote", "uploading") });
    try {
      const { photoPath } = await uploadPhoto(photo, "bouquets");
      setState({ step: "working", message: t("newQuote", "analyzing") });
      const created = await createQuote(photoPath);
      // Replace /quotes/new, so a reload or Back keeps the quote instead of starting over.
      router.replace(`/quotes/${created.quote.id}`);
    } catch (e) {
      if (isUnauthorized(e)) return router.push("/sign-in");
      console.error(e);
      setError(true);
      setState({ step: "pick" });
    }
  }

  if (state.step === "working") return <p role="status" className="py-8 text-center">{state.message}</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* "both", not camera only: customers' bouquet photos usually arrive in Messenger, so they're in the gallery. */}
      <PhotoPicker source="both" onPhoto={handlePhoto} />
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t("common", "error")}</p>}
    </div>
  );
}
