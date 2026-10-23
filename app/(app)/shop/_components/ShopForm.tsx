"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@/components/receipt/kit";
import type { UpdateShopRequest } from "@/lib/contract";
import { t } from "@/lib/strings";
import type { Shop } from "@/lib/types";
import { getShop, updateShop } from "./api";

type Field = "wrapFee" | "laborFee" | "markupPercent" | "minimumMarginPercent" | "validForDays";
type Draft = Record<Field | "name", string>;

const toDraft = (s: Shop): Draft => ({
  name: s.name,
  wrapFee: String(s.wrapFee),
  laborFee: String(s.laborFee),
  markupPercent: String(s.markupPercent),
  minimumMarginPercent: String(s.minimumMarginPercent),
  validForDays: String(s.validForDays),
});

/** The error for a field's text, or null when it is valid. */
function check(field: Field, text: string): string | null {
  const n = text.trim() === "" ? NaN : Number(text);
  if (field === "validForDays") return Number.isInteger(n) && n >= 1 ? null : t("shop", "daysNeeded");
  if (field === "minimumMarginPercent") return n >= 0 && n < 100 ? null : t("shop", "percentNeeded");
  return n >= 0 ? null : t("shop", "numberNeeded");
}

export function ShopForm() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    getShop().then((s) => {
      setShop(s);
      setDraft(toDraft(s));
    }, () => setStatus("error"));
  }, []);

  if (!shop || !draft) {
    return status === "error"
      ? <p role="alert" className="text-red-700 dark:text-red-400">{t("common", "error")}</p>
      : <p role="status">{t("shop", "loading")}</p>;
  }

  const fields: Array<{ field: Field; label: string; hint?: string }> = [
    { field: "wrapFee", label: `${t("shop", "wrapFee")} (₱)`, hint: t("shop", "feeHint") },
    { field: "laborFee", label: `${t("shop", "laborFee")} (₱)`, hint: t("shop", "feeHint") },
    { field: "markupPercent", label: t("shop", "markup") },
    { field: "minimumMarginPercent", label: t("shop", "minimumMargin") },
    { field: "validForDays", label: t("shop", "validForDays") },
  ];
  const errors = Object.fromEntries(fields.map(({ field }) => [field, check(field, draft[field])]));
  const invalid = Object.values(errors).some(Boolean);
  // Only the fields that changed are sent.
  const changes: UpdateShopRequest = {};
  if (draft.name.trim() !== shop.name) changes.name = draft.name.trim();
  for (const { field } of fields) if (Number(draft[field]) !== shop[field]) changes[field] = Number(draft[field]);
  const unchanged = Object.keys(changes).length === 0;

  async function save() {
    setStatus("saving");
    try {
      const saved = await updateShop(changes);
      setShop(saved);
      setDraft(toDraft(saved));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const edit = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setStatus("idle");
  };

  return (
    <div className="flex flex-col gap-4">
      <Input label={t("shop", "name")} hint={t("shop", "nameHint")} value={draft.name} onChange={(e) => edit({ name: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ field, label, hint }) => (
          <Input
            key={field}
            label={label}
            inputMode={field === "validForDays" ? "numeric" : "decimal"}
            value={draft[field]}
            aria-invalid={!!errors[field]}
            // "!" beats the kit's own border color, which has the same specificity.
            className={errors[field] ? "border-red-600! dark:border-red-500!" : ""}
            hint={errors[field] ?? hint}
            onChange={(e) => edit({ [field]: e.target.value })}
          />
        ))}
      </div>
      <div className="sticky bottom-[calc(5rem+1px+env(safe-area-inset-bottom))] flex flex-col gap-2 bg-white py-3 dark:bg-zinc-950">
        {status === "saved" && <p role="status" className="text-sm text-green-800 dark:text-green-400">{t("shop", "saved")}</p>}
        {status === "error" && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{t("common", "error")}</p>}
        <Button disabled={invalid || unchanged || status === "saving"} onClick={save}>
          {status === "saving" ? t("shop", "saving") : t("common", "save")}
        </Button>
      </div>
    </div>
  );
}
