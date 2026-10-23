import { useState } from "react";
import { type AddStemRequest, type StemWithCost, stemName } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { Unit } from "@/lib/types";
import { ApiFailure } from "./api";
import { Button, Input, Row, Select } from "./kit";
import { type DraftLine, isMatched, type LineField, lineProblems, parseAmount, sampleFromLine } from "./lines";

const UNITS: Unit[] = ["dozen", "per10", "bundle", "bunch", "piece"];
const ADD_ROW = "__add";
// "!" beats the kit's own border color, which has the same specificity.
const INVALID = "border-red-600! dark:border-red-500!";

type Props = {
  lines: DraftLine[];
  stems: StemWithCost[];
  onChange: (lines: DraftLine[]) => void;
  onAddStem: (input: AddStemRequest) => Promise<StemWithCost>;
};

export function ReceiptTable({ lines, stems, onChange, onAddStem }: Props) {
  // Any change by the florist marks the line edited, which clears its "unsure" highlight.
  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch, edited: true } : l)));
  const visible = stems.filter((s) => !s.hidden);

  return (
    <ul className="flex flex-col gap-3">
      {lines.map((line) => (
        <ReceiptLineRow
          key={line.key}
          line={line}
          stems={visible}
          problems={lineProblems(line, stems)}
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
  problems,
  onUpdate,
  onRemove,
  onAddStem,
}: {
  line: DraftLine;
  stems: StemWithCost[];
  problems: Set<LineField>;
  onUpdate: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  onAddStem: Props["onAddStem"];
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ flower: "", color: "", isFiller: false });
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // A line matched to a hidden row counts as unmatched (`stems` holds visible rows only).
  const matched = isMatched(line.stemId, stems);
  const invalid = (field: LineField) => (problems.has(field) ? { "aria-invalid": true, className: INVALID } : {});

  async function addRow() {
    // The new row takes the line's current unit and bundle size (Ice, #17 review).
    if (!line.unit) return setAddError(t("scan", "unitNeeded"));
    const bundleSize = line.unit === "bundle" ? parseAmount(line.bundleSize) : null;
    if (bundleSize !== null && !(Number.isInteger(bundleSize) && bundleSize > 0)) {
      return setAddError(t("scan", "bundleSizeNeeded"));
    }
    setBusy(true);
    setAddError(null);
    try {
      // Sample price: what one unit cost on this line (total paid ÷ quantity), else 0. Saving the receipt replaces it.
      const added = await onAddStem({ ...draft, unit: line.unit, bundleSize, samplePrice: sampleFromLine(line) });
      onUpdate({ stemId: added.id });
      setAdding(false);
    } catch (e) {
      console.error(e);
      setAddError(
        e instanceof ApiFailure && e.code === "invalid_bundle_size" ? t("scan", "bundleSizeNeeded") : t("common", "error"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row highlight={!matched || (line.confidence !== "high" && !line.edited)}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("scan", "onReceipt")} <span className="font-mono">{line.rawText}</span>
        {line.note && <span className="block">{line.note}</span>}
      </p>

      <Select
        label={matched ? t("scan", "stem") : t("scan", "matchLine")}
        value={adding ? ADD_ROW : matched ? (line.stemId ?? "") : ""}
        {...(adding ? {} : invalid("stem"))}
        onChange={(e) => {
          const add = e.target.value === ADD_ROW;
          setAdding(add);
          setAddError(null);
          if (!add) onUpdate({ stemId: e.target.value || null });
        }}
      >
        <option value="">{t("scan", "choose")}</option>
        {stems.map((s) => (
          <option key={s.id} value={s.id}>
            {stemName(s)}
          </option>
        ))}
        <option value={ADD_ROW}>{t("scan", "addRow")}</option>
      </Select>

      {adding && (
        <div className="flex flex-col gap-3 rounded-xl bg-white p-3 dark:bg-zinc-900">
          <Input label={t("scan", "newFlower")} value={draft.flower} onChange={(e) => setDraft({ ...draft, flower: e.target.value })} />
          <Input label={t("scan", "newColor")} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={draft.isFiller}
              onChange={(e) => setDraft({ ...draft, isFiller: e.target.checked })}
            />
            {t("scan", "isFiller")}
          </label>
          {addError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{addError}</p>}
          <Button disabled={busy || !draft.flower.trim()} onClick={addRow}>
            {t("scan", "addRowSave")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t("scan", "quantity")}
          inputMode="decimal"
          value={line.quantity}
          {...invalid("quantity")}
          onChange={(e) => onUpdate({ quantity: e.target.value })}
        />
        <Select label={t("scan", "unit")} value={line.unit} {...invalid("unit")} onChange={(e) => onUpdate({ unit: e.target.value as Unit | "" })}>
          <option value="">{t("scan", "choose")}</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {t("units", u)}
            </option>
          ))}
        </Select>
        {line.unit === "bundle" && (
          <Input
            label={t("scan", "bundleSize")}
            inputMode="numeric"
            value={line.bundleSize}
            {...invalid("bundleSize")}
            onChange={(e) => onUpdate({ bundleSize: e.target.value })}
          />
        )}
        <Input
          label={t("scan", "totalPaid")}
          inputMode="decimal"
          value={line.totalPaid}
          hint={line.unitPrice != null ? t("scan", "unitPriceHint", { n: line.unitPrice }) : undefined}
          {...invalid("totalPaid")}
          onChange={(e) => onUpdate({ totalPaid: e.target.value })}
        />
      </div>

      <Button variant="danger" onClick={onRemove}>
        {t("scan", "remove")}
      </Button>
    </Row>
  );
}
