"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { PhotoPicker } from "@/components/receipt/PhotoPicker";
import { t } from "@/lib/strings";
import { createQuote, isUnauthorized, uploadPhoto } from "./api";
import { createTickets } from "./latest";

type State = { step: "pick" } | { step: "working"; message: string };

export function NewQuote() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "pick" });
  const [error, setError] = useState(false);
  const tickets = useRef(createTickets());

  // Next keeps this page mounted but hidden after leaving it; start fresh when it comes back.
  // Leaving also makes an upload or AI count still running stale: its answer is ignored, so the
  // florist is never pulled back to a quote from a page they left. The quote is still saved and
  // shows in "Mga quote".
  useLayoutEffect(() => {
    const current = tickets.current;
    return () => {
      current.cancel();
      setState({ step: "pick" });
      setError(false);
    };
  }, []);

  async function handlePhoto(photo: File) {
    const ticket = tickets.current.next();
    const left = () => !tickets.current.isCurrent(ticket);
    setError(false);
    setState({ step: "working", message: t("newQuote", "uploading") });
    try {
      const { photoPath } = await uploadPhoto(photo, "bouquets");
      if (left()) return;
      setState({ step: "working", message: t("newQuote", "analyzing") });
      const created = await createQuote(photoPath);
      if (left()) return;
      // Replace /quotes/new, so a reload or Back keeps the quote instead of starting over.
      router.replace(`/quotes/${created.quote.id}`);
    } catch (e) {
      if (left()) return;
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
