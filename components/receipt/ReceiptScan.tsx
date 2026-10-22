"use client";

import { useState } from "react";
import { addStem, extractReceipt, listStems, saveReceipt, uploadPhoto } from "./api";
import { peso } from "./format";
import { Button, Input, Row } from "./kit";
import { PhotoPicker } from "./PhotoPicker";
import { type DraftLine, ReceiptTable, stemName } from "./ReceiptTable";
import { scan as t } from "./strings";
import type { ExtractReceiptResult, ReceiptLineInput, SaveReceiptResponse, Stem } from "./types";

type State =
  | { step: "pick" }
  | { step: "working"; message: string }
  | { step: "table"; photoPath: string; purchaseDate: string }
  | { step: "saved"; result: SaveReceiptResponse };

const todayInManila = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

function toDraft(line: ExtractReceiptResult["lines"][number], i: number, stems: Stem[]): DraftLine {
  const match = stems.find((s) => stemName(s).toLowerCase() === line.stem?.toLowerCase());
  return {
    key: String(i),
    rawText: line.rawText,
    stemId: match?.id ?? null,
    quantity: line.quantity?.toString() ?? "",
    unit: line.unit ?? match?.unit ?? "piece",
    bundleSize: (line.bundleSize ?? match?.bundleSize)?.toString() ?? "",
    // A missing total stays blank for the florist to fill; the unit price is shown as a hint.
    totalPaid: line.totalPaid?.toString() ?? "",
    unitPrice: line.unitPrice,
    confidence: line.confidence,
    note: line.note,
  };
}

function toInput(line: DraftLine): ReceiptLineInput | null {
  const quantity = num(line.quantity);
  const totalPaid = num(line.totalPaid);
  const bundleSize = line.unit === "bundle" ? num(line.bundleSize) : null;
  if (!line.stemId || !(quantity > 0) || !(totalPaid >= 0)) return null;
  if (bundleSize !== null && !(Number.isInteger(bundleSize) && bundleSize > 0)) return null;
  return { stemId: line.stemId, quantity, unit: line.unit, bundleSize, totalPaid };
}

export function ReceiptScan() {
  const [state, setState] = useState<State>({ step: "pick" });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [stems, setStems] = useState<Stem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(message: string, task: () => Promise<T>, fallback: State): Promise<T | null> {
    setError(null);
    setState({ step: "working", message });
    try {
      return await task();
    } catch {
      setError(t.failed);
      setState(fallback);
      return null;
    }
  }

  async function handlePhoto(photo: File) {
    const result = await run(t.uploading, async () => {
      const { photoPath } = await uploadPhoto(photo);
      setState({ step: "working", message: t.reading });
      const [extract, stemList] = await Promise.all([extractReceipt(photoPath), listStems()]);
      return { photoPath, extract, stemList };
    }, { step: "pick" });
    if (!result) return;
    setStems(result.stemList);
    setLines(result.extract.lines.map((l, i) => toDraft(l, i, result.stemList)));
    setState({ step: "table", photoPath: result.photoPath, purchaseDate: result.extract.purchaseDate ?? todayInManila() });
  }

  async function handleAddStem(input: Parameters<typeof addStem>[0]) {
    const added = await addStem(input);
    setStems((list) => [...list, added]);
    return added;
  }

  if (state.step === "pick") {
    return (
      <div className="flex flex-col gap-3">
        <PhotoPicker source="camera" label={t.takePhoto} onPhoto={handlePhoto} />
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (state.step === "working") {
    return <p role="status" className="py-8 text-center">{state.message}</p>;
  }

  if (state.step === "saved") {
    const { batches, underwaterCount } = state.result;
    const byId = new Map(stems.map((s) => [s.id, s]));
    return (
      <div className="flex flex-col gap-4">
        {underwaterCount > 0 && (
          <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-3 font-semibold text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
            {t.underwater(underwaterCount)}
          </p>
        )}
        <p>{t.saved}</p>
        <ul className="flex flex-col gap-2">
          {batches.map((b) => {
            const s = byId.get(b.stemId);
            return (
              <Row key={b.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{s ? stemName(s) : b.stemId}</span>
                  <span className="shrink-0">
                    {peso.format(b.costPerStem)} {s?.isFiller ? t.perBunch : t.perStem}
                  </span>
                </div>
              </Row>
            );
          })}
        </ul>
        <Button onClick={() => setState({ step: "pick" })}>{t.scanAgain}</Button>
      </div>
    );
  }

  const inputs = lines.map(toInput);
  const unmatched = lines.filter((l) => !l.stemId).length;
  const incomplete = inputs.filter((x) => x === null).length - unmatched;
  const blocker = lines.length === 0 ? t.noLines : unmatched ? t.unmatched(unmatched) : incomplete ? t.incomplete(incomplete) : null;
  const tableState = state;

  async function handleSave() {
    const result = await run(t.saving, () =>
      saveReceipt({
        photoPath: tableState.photoPath,
        purchaseDate: tableState.purchaseDate,
        lines: inputs.filter((x) => x !== null),
      }), tableState);
    if (result) setState({ step: "saved", result });
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label={t.purchaseDate}
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
          {t.save}
        </Button>
      </div>
    </div>
  );
}
