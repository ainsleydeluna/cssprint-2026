"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type AddStemRequest,
  type ReceiptDraftLine,
  type SaveReceiptResponse,
  type StemWithCost,
  stemName,
} from "@/lib/contract";
import { t } from "@/lib/strings";
import { addStem, extractReceipt, isUnauthorized, listStems, saveReceipt, uploadPhoto } from "./api";
import { peso } from "./format";
import { Button, Input, Row } from "./kit";
import { type DraftLine, saveBlocker, toInput } from "./lines";
import { PhotoPicker } from "./PhotoPicker";
import { ReceiptTable } from "./ReceiptTable";

type State =
  | { step: "pick" }
  | { step: "working"; message: string }
  | { step: "table"; photoPath: string; purchaseDate: string; demo: boolean; note: string }
  | { step: "saved"; result: SaveReceiptResponse };

function toDraft(line: ReceiptDraftLine, i: number): DraftLine {
  return {
    key: String(i),
    rawText: line.rawText,
    stemId: line.stemId,
    quantity: line.quantity?.toString() ?? "",
    unit: line.unit ?? "",
    bundleSize: line.bundleSize?.toString() ?? "",
    // The route fills a missing total when it can; null means the florist fills it in.
    totalPaid: line.totalPaid?.toString() ?? "",
    unitPrice: line.unitPrice,
    confidence: line.confidence,
    note: line.note,
    edited: false,
  };
}

export function ReceiptScan() {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "pick" });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [stems, setStems] = useState<StemWithCost[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(message: string, task: () => Promise<T>, fallback: State): Promise<T | null> {
    setError(null);
    setState({ step: "working", message });
    try {
      return await task();
    } catch (e) {
      if (isUnauthorized(e)) router.push("/sign-in");
      else {
        console.error(e);
        setError(t("common", "error"));
      }
      setState(fallback);
      return null;
    }
  }

  async function handlePhoto(photo: File) {
    const result = await run(t("scan", "uploading"), async () => {
      const { photoPath } = await uploadPhoto(photo, "receipts");
      setState({ step: "working", message: t("scan", "reading") });
      const [extract, stemList] = await Promise.all([extractReceipt(photoPath), listStems()]);
      return { photoPath, extract, stemList };
    }, { step: "pick" });
    if (!result) return;
    const { photoPath, extract, stemList } = result;
    setStems(stemList);
    setLines(extract.lines.map(toDraft));
    // The route answers today in Manila when the AI could not read a date.
    setState({ step: "table", photoPath, purchaseDate: extract.purchaseDate, demo: extract.demo, note: extract.note });
  }

  async function handleAddStem(input: AddStemRequest) {
    try {
      const added = await addStem(input);
      setStems((list) => [...list, added]);
      return added;
    } catch (e) {
      if (isUnauthorized(e)) router.push("/sign-in");
      throw e;
    }
  }

  if (state.step === "pick") {
    return (
      <div className="flex flex-col gap-3">
        <PhotoPicker source="both" onPhoto={handlePhoto} />
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (state.step === "working") {
    return <p role="status" className="py-8 text-center">{state.message}</p>;
  }

  if (state.step === "saved") {
    const { batches, underwaterQuoteIds } = state.result;
    const byId = new Map(stems.map((s) => [s.id, s]));
    return (
      <div className="flex flex-col gap-4">
        {underwaterQuoteIds.length > 0 && (
          <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-3 font-semibold text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
            {t("quotes", "underwaterBanner", { count: underwaterQuoteIds.length })}
          </p>
        )}
        <p>{t("scan", "saved")}</p>
        <ul className="flex flex-col gap-2">
          {batches.map((b) => {
            const s = byId.get(b.stemId);
            return (
              <Row key={b.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{s ? stemName(s) : b.stemId}</span>
                  <span className="shrink-0">
                    {peso.format(b.costPerStem)} {t("scan", s?.isFiller ? "perBunch" : "perStem")}
                  </span>
                </div>
              </Row>
            );
          })}
        </ul>
        <Button onClick={() => setState({ step: "pick" })}>{t("scan", "scanAgain")}</Button>
      </div>
    );
  }

  const inputs = lines.map((l) => toInput(l, stems));
  const blocker = saveBlocker(lines, stems, state.note);
  const tableState = state;

  async function handleSave() {
    const result = await run(t("scan", "saving"), () =>
      saveReceipt({
        photoPath: tableState.photoPath,
        purchaseDate: tableState.purchaseDate,
        lines: inputs.filter((x) => x !== null),
      }), tableState);
    if (result) setState({ step: "saved", result });
  }

  return (
    <div className="flex flex-col gap-4">
      {state.demo && (
        <p className="self-start rounded-full bg-zinc-200 px-3 py-1 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
          {t("common", "demo")}
        </p>
      )}
      <Input
        label={t("scan", "purchaseDate")}
        type="date"
        value={state.purchaseDate}
        onChange={(e) => setState({ ...tableState, purchaseDate: e.target.value })}
      />
      <ReceiptTable lines={lines} stems={stems} onChange={setLines} onAddStem={handleAddStem} />
      {/* Main action stays above the bottom bar (5rem + 1px border + home-indicator inset). */}
      <div className="sticky bottom-[calc(5rem+1px+env(safe-area-inset-bottom))] flex flex-col gap-2 bg-white py-3 dark:bg-zinc-950">
        {(blocker || error) && (
          <p role="status" className="text-sm text-red-700 dark:text-red-400">{error ?? blocker}</p>
        )}
        <Button disabled={!!blocker || !state.purchaseDate} onClick={handleSave}>
          {t("common", "save")}
        </Button>
      </div>
    </div>
  );
}
