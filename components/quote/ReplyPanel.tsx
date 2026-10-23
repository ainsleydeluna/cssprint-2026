// No "use client" here: onBack, onCopied and onText are functions, so this is rendered only from
// QuoteScreen (a Client Component), which makes it client code too.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/receipt/kit";
import type { QuoteDetail } from "@/lib/contract";
import { manilaToday, timeToQuoteSeconds } from "@/lib/server/quote-rules";
import { t } from "@/lib/strings";
import type { Quote } from "@/lib/types";
import { ApiFailure, draftReply, isUnauthorized, markCopied, updateReplyText } from "./api";
import type { SaveState } from "./autosave";
import { copyBlocker, copyReply, quoteLock, replyEdited, savesReplyText } from "./copy";
import { formatDuration } from "./duration";
import { QuoteLockNotice } from "./QuoteLockNotice";
import { replySaver } from "./reply-save";

type Props = {
  detail: QuoteDetail;
  demo: boolean;
  onBack: () => void;
  /** The quote as the copied route saved it (sent after the first copy). */
  onCopied: (quote: Quote) => void;
  /** The text in the box, on every change, so coming back shows it without a new draft. */
  onText: (text: string) => void;
  /** The quote's price at latest costs, shown when it is underwater. */
  newPrice: number;
};

type Problem = "error" | "incomplete" | "clipboard" | "notSaved";

export function ReplyPanel({ detail, demo, onBack, onCopied, onText, newPrice }: Props) {
  const router = useRouter();
  const { quote, lines } = detail;
  // Expired or underwater: no new draft and no copy (see QuoteLockNotice for the way on).
  const lock = quoteLock(quote, manilaToday(new Date()));
  // A draft quote keeps its last drafted text; a sent quote keeps what was copied.
  const [message, setMessage] = useState(quote.replyText);
  // The text the server last gave, to tell whether the florist has edited the message.
  const [serverText, setServerText] = useState(quote.replyText);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [draftDemo, setDraftDemo] = useState(false);
  const [busy, setBusy] = useState<"drafting" | "copying" | null>(quote.replyText || lock ? null : "drafting");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const [save, setSave] = useState<SaveState>("saved");
  // A draft's edited text is saved after a pause in typing; leaving the screen saves it at once.
  // A sent quote's edits stay on screen only (savesReplyText): copying saves them.
  const [saver] = useState(() => replySaver(quote.replyText, (text) => updateReplyText(quote.id, text), setSave));
  useEffect(() => () => void saver.flush(), [saver]);

  // A text save still waiting goes first, so it can't arrive after the next lines save.
  const [leaving, setLeaving] = useState(false);
  async function goBack() {
    setLeaving(true);
    await saver.flush();
    onBack();
  }

  function showText(text: string) {
    setMessage(text);
    onText(text);
  }

  function fail(e: unknown, fallback: Problem) {
    if (isUnauthorized(e)) return router.push("/sign-in");
    console.error(e);
    setProblem(e instanceof ApiFailure && e.code === "incomplete_quote" ? "incomplete" : fallback);
  }

  // Sets state only after the call answers, so the first draft can start from the effect below.
  async function fetchDraft() {
    try {
      const reply = await draftReply(quote.id);
      showText(reply.message);
      setServerText(reply.message);
      // The reply route saves a draft's text itself; a sent quote's new draft is saved when copied.
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
    if (started.current || quote.replyText || lock) return;
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
      // Any text save still waiting goes first, so it can't land after the copy and undo it.
      markCopied: async (text) => {
        await saver.flush();
        return markCopied(quote.id, text);
      },
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
      <Button variant="secondary" className="self-start" disabled={leaving} onClick={goBack}>
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
            showText(e.target.value);
            if (savesReplyText(quote)) saver.edit(e.target.value);
            setCopied(false);
          }}
        />
      </label>
      {save !== "saved" && (
        <p role="status" className="flex min-h-6 items-center justify-between gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {save === "failed" ? (
            <>
              <span className="text-red-700 dark:text-red-400">{t("quote", "saveFailed")}</span>
              <button type="button" className="min-h-12 px-2 font-semibold text-green-800 dark:text-green-400" onClick={() => void saver.flush()}>
                {t("common", "retry")}
              </button>
            </>
          ) : (
            t("quote", "saving")
          )}
        </p>
      )}
      <QuoteLockNotice quoteId={quote.id} lock={lock} newPrice={lock?.kind === "underwater" ? newPrice : null} />

      {/* Main actions stay above the bottom bar (5rem + 1px border + home-indicator inset). */}
      <div className="sticky bottom-[calc(5rem+1px+env(safe-area-inset-bottom))] flex flex-col gap-2 bg-background py-3">
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
            disabled={busy !== null || confirmingRegenerate || !!lock}
            // Ask first only when a new draft would throw away the florist's edits.
            onClick={() => (replyEdited(message, serverText) ? setConfirmingRegenerate(true) : regenerate())}
          >
            {t("quote", "regenerate")}
          </Button>
          <Button disabled={busy !== null || !!blocker || !!lock || !message.trim()} onClick={copy}>
            {t("quote", "copyReply")}
          </Button>
        </div>
      </div>
    </div>
  );
}
