import { useState } from "react";
import { Button, Input, Select } from "@/components/receipt/kit";
import type { AddStemRequest, StemWithCost } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { Unit } from "@/lib/types";
import { ApiFailure } from "./api";
import { UNITS, unitName } from "./units";

/** Add a typed row (no `stem`) or edit one. Sends the full set of editable fields. */
export function StemForm({
  stem,
  onSubmit,
  onCancel,
}: {
  stem?: StemWithCost;
  onSubmit: (req: AddStemRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    flower: stem?.flower ?? "",
    color: stem?.color ?? "",
    isFiller: stem?.isFiller ?? false,
    unit: stem?.unit ?? ("piece" as Unit),
    bundleSize: stem?.bundleSize?.toString() ?? "",
    samplePrice: stem?.samplePrice.toString() ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

  async function submit() {
    const bundleSize = draft.unit === "bundle" ? num(draft.bundleSize) : null;
    // Checked here before sending; the route also answers invalid_bundle_size.
    if (bundleSize !== null && !(Number.isInteger(bundleSize) && bundleSize > 0)) return setError(t("shop", "bundleSizeNeeded"));
    const samplePrice = num(draft.samplePrice);
    if (!(samplePrice >= 0)) return setError(t("shop", "numberNeeded"));
    setBusy(true);
    setError(null);
    try {
      const { flower, color, isFiller, unit } = draft;
      await onSubmit({ flower: flower.trim(), color: color.trim(), isFiller, unit, bundleSize, samplePrice });
    } catch (e) {
      setError(e instanceof ApiFailure && e.code === "invalid_bundle_size" ? t("shop", "bundleSizeNeeded") : t("common", "error"));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
      <div className="grid grid-cols-2 gap-3">
        <Input label={t("shop", "flower")} value={draft.flower} onChange={(e) => setDraft({ ...draft, flower: e.target.value })} />
        <Input label={t("shop", "color")} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
      </div>
      <label className="flex min-h-12 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.isFiller}
          // Fillers are bought and counted by the bunch.
          onChange={(e) => setDraft({ ...draft, isFiller: e.target.checked, unit: e.target.checked ? "bunch" : draft.unit })}
        />
        {t("shop", "isFiller")}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label={t("shop", "unit")}
          value={draft.unit}
          disabled={draft.isFiller}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value as Unit })}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {unitName(u)}
            </option>
          ))}
        </Select>
        {draft.unit === "bundle" && (
          <Input
            label={t("shop", "bundleSize")}
            inputMode="numeric"
            value={draft.bundleSize}
            onChange={(e) => setDraft({ ...draft, bundleSize: e.target.value })}
          />
        )}
        <Input
          label={t("shop", "samplePrice")}
          inputMode="decimal"
          value={draft.samplePrice}
          onChange={(e) => setDraft({ ...draft, samplePrice: e.target.value })}
        />
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy || !draft.flower.trim() || !draft.color.trim()} onClick={submit}>
          {t("common", "save")}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          {t("common", "cancel")}
        </Button>
      </div>
    </div>
  );
}
