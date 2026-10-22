import { useState } from "react";
import type { AddStemRequest, StemWithCost } from "@/lib/contract";
import { t as label } from "@/lib/strings";
import type { Confidence, Unit } from "@/lib/types";
import { ApiFailure } from "./api";
import { Button, Input, Row, Select } from "./kit";
import { scan as t, units } from "./strings";

/** One receipt line while the florist edits it. Numbers stay strings until save. */
export type DraftLine = {
  key: string;
  rawText: string;
  stemId: string | null;
  quantity: string;
  /** "" when the receipt doesn't say; the florist must choose one. */
  unit: Unit | "";
  bundleSize: string;
  totalPaid: string;
  unitPrice: number | null;
  confidence: Confidence;
  note: string;
};

const ADD_ROW = "__add";

type Props = {
  lines: DraftLine[];
  stems: StemWithCost[];
  onChange: (lines: DraftLine[]) => void;
  onAddStem: (input: AddStemRequest) => Promise<StemWithCost>;
};

export function ReceiptTable({ lines, stems, onChange, onAddStem }: Props) {
  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <ul className="flex flex-col gap-3">
      {lines.map((line) => (
        <ReceiptLineRow
          key={line.key}
          line={line}
          stems={stems}
          onUpdate={(patch) => update(line.key, patch)}
          onRemove={() => onChange(lines.filter((l) => l.key !== line.key))}
          onAddStem={onAddStem}
        />
      ))}
    </ul>
  );
}

function ReceiptLineRow({
  line,
  stems,
  onUpdate,
  onRemove,
  onAddStem,
}: {
  line: DraftLine;
  stems: StemWithCost[];
  onUpdate: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  onAddStem: Props["onAddStem"];
}) {
  const [adding, setAdding] = useState(false);
  // The receipt's own unit price is the new row's sample price: both are per one unit as bought.
  const [draft, setDraft] = useState({ flower: "", color: "", isFiller: false, samplePrice: line.unitPrice?.toString() ?? "" });
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const samplePrice = draft.samplePrice.trim() === "" ? NaN : Number(draft.samplePrice);

  async function addRow() {
    setBusy(true);
    setAddError(null);
    try {
      const unit = draft.isFiller ? "bunch" : line.unit || "piece";
      const bundleSize = unit === "bundle" ? Number(line.bundleSize) || null : null;
      const { flower, color, isFiller } = draft;
      const added = await onAddStem({ flower, color, isFiller, unit, bundleSize, samplePrice });
      onUpdate({ stemId: added.id, unit });
      setAdding(false);
    } catch (e) {
      setAddError(e instanceof ApiFailure && e.code === "invalid_bundle_size" ? t.bundleSizeNeeded : label("common", "error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row highlight={!line.stemId || line.confidence !== "high"}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t.onReceipt} <span className="font-mono">{line.rawText}</span>
        {line.note && <span className="block">{line.note}</span>}
      </p>

      <Select
        label={line.stemId ? t.stem : label("scan", "matchLine")}
        value={adding ? ADD_ROW : (line.stemId ?? "")}
        onChange={(e) => {
          const add = e.target.value === ADD_ROW;
          setAdding(add);
          if (!add) onUpdate({ stemId: e.target.value || null });
        }}
      >
        <option value="">{t.choose}</option>
        {stems
          .filter((s) => !s.hidden || s.id === line.stemId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        <option value={ADD_ROW}>{t.addRow}</option>
      </Select>

      {adding && (
        <div className="flex flex-col gap-3 rounded-xl bg-white p-3 dark:bg-zinc-900">
          <Input label={t.newFlower} value={draft.flower} onChange={(e) => setDraft({ ...draft, flower: e.target.value })} />
          <Input label={t.newColor} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
          <Input
            label={t.samplePrice}
            inputMode="decimal"
            value={draft.samplePrice}
            onChange={(e) => setDraft({ ...draft, samplePrice: e.target.value })}
          />
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.isFiller}
              onChange={(e) => setDraft({ ...draft, isFiller: e.target.checked })}
            />
            {t.isFiller}
          </label>
          {addError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{addError}</p>}
          <Button disabled={busy || !draft.flower.trim() || !(samplePrice >= 0)} onClick={addRow}>
            {t.addRowSave}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t.quantity}
          inputMode="decimal"
          value={line.quantity}
          onChange={(e) => onUpdate({ quantity: e.target.value })}
        />
        <Select label={t.unit} value={line.unit} onChange={(e) => onUpdate({ unit: e.target.value as Unit | "" })}>
          <option value="">{t.choose}</option>
          {(Object.keys(units) as Unit[]).map((u) => (
            <option key={u} value={u}>
              {units[u]}
            </option>
          ))}
        </Select>
        {line.unit === "bundle" && (
          <Input
            label={t.bundleSize}
            inputMode="numeric"
            value={line.bundleSize}
            onChange={(e) => onUpdate({ bundleSize: e.target.value })}
          />
        )}
        <Input
          label={t.totalPaid}
          inputMode="decimal"
          value={line.totalPaid}
          hint={line.unitPrice != null ? t.unitPriceHint(line.unitPrice) : undefined}
          onChange={(e) => onUpdate({ totalPaid: e.target.value })}
        />
      </div>

      <Button variant="danger" onClick={onRemove}>
        {t.remove}
      </Button>
    </Row>
  );
}
