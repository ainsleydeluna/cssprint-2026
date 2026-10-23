// No "use client" here: onBack and onCopied are functions, so this is rendered only from
// QuoteScreen (a Client Component), which makes it client code too.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/receipt/kit";
import type { QuoteDetail } from "@/lib/contract";
import { timeToQuoteSeconds } from "@/lib/server/quote-rules";
import { t } from "@/lib/strings";
import type { Quote } from "@/lib/types";
import { ApiFailure, draftReply, isUnauthorized, markCopied } from "./api";
import { copyBlocker, copyReply, replyEdited } from "./copy";
import { formatDuration } from "./duration";

type Props = {
  detail: QuoteDetail;
  demo: boolean;
  onBack: () => void;
  /** The quote as the copied route saved it (sent after the first copy). */
  onCopied: (quote: Quote) => void;
};

type Problem = "error" | "incomplete" | "clipboard" | "notSaved";

export function ReplyPanel({ detail, demo, onBack, onCopied }: Props) {
  const router = useRouter();
  const { quote, lines } = detail;
  // A draft quote keeps its last drafted text; a sent quote keeps what was copied.
  const [message, setMessage] = useState(quote.replyText);
  // The text the server last gave, to tell whether the florist has edited the message.
  const [serverText, setServerText] = useState(quote.replyText);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [draftDemo, setDraftDemo] = useState(false);
  const [busy, setBusy] = useState<"drafting" | "copying" | null>(quote.replyText ? null : "drafting");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  function fail(e: unknown, fallback: Problem) {
    if (isUnauthorized(e)) return router.push("/sign-in");
    console.error(e);
    setProblem(e instanceof ApiFailure && e.code === "incomplete_quote" ? "incomplete" : fallback);
  }

  // Sets state only after the call answers, so the first draft can start from the effect below.
  async function fetchDraft() {
    try {
      const reply = await draftReply(quote.id);
      setMessage(reply.message);
      setServerText(reply.message);
      setDraftDemo(reply.demo);
    } catch (e) {
      // ai_failed and anything else: the general error with "Subukan ulit".
      fail(e, "error");
    } finally {
      setBusy(null);
    }
  }

  // No text yet: draft one on opening. The ref keeps React's dev double-run from drafting twice.
  useEffect(() => {
    if (started.current || quote.replyText) return;
    started.current = true;
    void fetchDraft();
    // Only on opening; fetchDraft reads the quote id, which never changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function regenerate() {
    setConfirmingRegenerate(false);
    setBusy("drafting");
    setProblem(null);
    setCopied(false);
    void fetchDraft();
  }

  async function copy() {
    setBusy("copying");
    setProblem(null);
    const result = await copyReply(message, {
      writeClipboard: (text) => navigator.clipboard.writeText(text),
      markCopied: (text) => markCopied(quote.id, text),
    });
    setBusy(null);
    if (result.ok) {
      setCopied(true);
      setServerText(result.quote.replyText);
      onCopied(result.quote);
    } else if (result.failed === "clipboard") setProblem("clipboard");
    else fail(result.error, "notSaved");
  }

  const blocker = copyBlocker(lines);
  const seconds = timeToQuoteSeconds(quote);

  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" className="self-start" onClick={onBack}>
        {t("quote", "backToLines")}
      </Button>
      {(demo || draftDemo) && (
        <p className="self-start rounded-full bg-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          {t("common", "demo")}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="font-medium">{t("quote", "reply")}</span>
        <textarea
          className="min-h-48 rounded-xl border border-zinc-300 bg-white p-3 text-base dark:border-zinc-700 dark:bg-zinc-950"
          value={busy === "drafting" ? t("quote", "drafting") : message}
          readOnly={busy === "drafting"}
          onChange={(e) => {
            setMessage(e.target.value);
            setCopied(false);
          }}
        />
      </label>

      {/* Main actions stay above the bottom bar (5rem + 1px border + home-indicator inset). */}
      <div className="sticky bottom-[calc(5rem+1px+env(safe-area-inset-bottom))] flex flex-col gap-2 bg-white py-3 dark:bg-zinc-950">
        <p role="status" className="text-sm">
          {busy === "copying" && t("quote", "copying")}
          {busy === null && copied && <span className="font-semibold text-green-800 dark:text-green-400">{t("quote", "copied")}</span>}
          {busy === null && seconds !== null && (
            <span className="block text-zinc-600 dark:text-zinc-400">
              {t("quote", "timeToQuote", { time: formatDuration(seconds) })}
            </span>
          )}
        </p>
        {blocker && <p className="text-sm text-amber-800 dark:text-amber-300">{blocker}</p>}
        {problem && (
          <div role="alert" className="flex items-center justify-between gap-2 text-sm text-red-700 dark:text-red-400">
            <span>
              {problem === "error" ? t("common", "error")
              : problem === "incomplete" ? t("quote", "incompleteServer")
              : problem === "clipboard" ? t("quote", "clipboardFailed")
              : t("quote", "notSaved")}
            </span>
            {(problem === "error" || problem === "notSaved") && (
              <button
                type="button"
                className="min-h-12 shrink-0 px-2 font-semibold text-green-800 dark:text-green-400"
                onClick={problem === "error" ? regenerate : copy}
              >
                {t("common", "retry")}
              </button>
            )}
          </div>
        )}
        {confirmingRegenerate && (
          <div role="alertdialog" aria-labelledby="regenerate-title" className="flex flex-col gap-3 rounded-xl border border-red-300 p-3 dark:border-red-800">
            <p id="regenerate-title" className="font-semibold">{t("quote", "regenerateConfirmTitle")}</p>
            <p className="text-sm">{t("quote", "regenerateConfirmBody")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger" onClick={regenerate}>{t("quote", "regenerate")}</Button>
              <Button variant="secondary" onClick={() => setConfirmingRegenerate(false)}>{t("common", "cancel")}</Button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            disabled={busy !== null || confirmingRegenerate}
            // Ask first only when a new draft would throw away the florist's edits.
            onClick={() => (replyEdited(message, serverText) ? setConfirmingRegenerate(true) : regenerate())}
          >
            {t("quote", "regenerate")}
          </Button>
          <Button disabled={busy !== null || !!blocker || !message.trim()} onClick={copy}>
            {t("quote", "copyReply")}
          </Button>
        </div>
      </div>
    </div>
  );
}
