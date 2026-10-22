import { useState } from "react";
import { Button, Input, Row, Select } from "./kit";
import { scan as t, units } from "./strings";
import type { Confidence, NewStem, Stem, Unit } from "./types";

/** One receipt line while the florist edits it. Numbers stay strings until save. */
export type DraftLine = {
  key: string;
  rawText: string;
  stemId: string | null;
  quantity: string;
  unit: Unit;
  bundleSize: string;
  totalPaid: string;
  unitPrice: number | null;
  confidence: Confidence;
  note: string;
};

export const stemName = (s: Stem) => `${s.flower} - ${s.color}`;
const ADD_ROW = "__add";

type Props = {
  lines: DraftLine[];
  stems: Stem[];
  onChange: (lines: DraftLine[]) => void;
  onAddStem: (input: NewStem) => Promise<Stem>;
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
  stems: Stem[];
  onUpdate: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  onAddStem: Props["onAddStem"];
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ flower: "", color: "", isFiller: false });
  const [busy, setBusy] = useState(false);

  async function addRow() {
    setBusy(true);
    try {
      const unit = draft.isFiller ? "bunch" : line.unit;
      const bundleSize = unit === "bundle" ? Number(line.bundleSize) || null : null;
      const added = await onAddStem({ ...draft, unit, bundleSize });
      onUpdate({ stemId: added.id, unit });
      setAdding(false);
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
        label={line.stemId ? t.stem : t.matchLine}
        value={adding ? ADD_ROW : (line.stemId ?? "")}
        onChange={(e) => {
          const add = e.target.value === ADD_ROW;
          setAdding(add);
          if (!add) onUpdate({ stemId: e.target.value || null });
        }}
      >
        <option value="">{t.choose}</option>
        {stems.map((s) => (
          <option key={s.id} value={s.id}>
            {stemName(s)}
          </option>
        ))}
        <option value={ADD_ROW}>{t.addRow}</option>
      </Select>

      {adding && (
        <div className="flex flex-col gap-3 rounded-xl bg-white p-3 dark:bg-zinc-900">
          <Input label={t.newFlower} value={draft.flower} onChange={(e) => setDraft({ ...draft, flower: e.target.value })} />
          <Input label={t.newColor} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.isFiller}
              onChange={(e) => setDraft({ ...draft, isFiller: e.target.checked })}
            />
            {t.isFiller}
          </label>
          <Button disabled={busy || !draft.flower.trim()} onClick={addRow}>
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
        <Select label={t.unit} value={line.unit} onChange={(e) => onUpdate({ unit: e.target.value as Unit })}>
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
