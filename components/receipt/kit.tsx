// Temporary building blocks for Pat's screens until Ian's components/ui (#13) lands.
// Swapping to components/ui means changing the imports of this one file.
// Shared by the receipt and shop branches as one commit: don't edit it on just one branch.
// Look comes from the theme classes in app/globals.css (btn, field-unsure).
import type { ComponentProps, ReactNode } from "react";

const buttonStyles = {
  primary: "btn-primary",     // Sage Mist: main action
  secondary: "btn-secondary", // Mint Frost: other actions
  danger: "btn-danger",       // Blush Sky with red text: delete, remove, regenerate
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      type="button"
      {...props}
      className={`btn min-h-12 ${buttonStyles[variant]} ${className}`}
    />
  );
}

// text-base (16px) stops iPhones zooming in when a field is focused.
const fieldStyles =
  "min-h-12 w-full min-w-0 rounded-xl border-2 border-ink/60 bg-white px-3 text-base text-ink focus:border-ink focus:outline-3 focus:outline-offset-2 focus:outline-ink";

type FieldProps = { label: string; hint?: string };

function Field({ label, hint, children }: FieldProps & { children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Input({ label, hint, className = "", ...props }: ComponentProps<"input"> & FieldProps) {
  return (
    <Field label={label} hint={hint}>
      <input {...props} className={`${fieldStyles} ${className}`} />
    </Field>
  );
}

export function Select({ label, hint, className = "", ...props }: ComponentProps<"select"> & FieldProps) {
  return (
    <Field label={label} hint={hint}>
      <select {...props} className={`${fieldStyles} ${className}`} />
    </Field>
  );
}

/** "blocking": the line stops saving or copying. "unsure": the AI wasn't sure ("Hindi sigurado"). */
export type RowTone = "blocking" | "unsure" | null;

const rowTones = {
  // The error style (alert-error): Blush Sky, red text, red left edge.
  blocking: "alert-error font-medium",
  // Peach Sorbet with a soft pink edge: close to "Alisin" but lighter, so the button still stands out.
  // Told apart from errors by normal text, no red edge, and the lavender "Hindi sigurado" badge.
  unsure: "border-2 border-[#f4a7b9] bg-[#ffe4e1]",
};

/** One item in a list, coloured by `tone` when the line needs the florist's attention. */
export function Row({ tone = null, children }: { tone?: RowTone; children: ReactNode }) {
  return (
    <li className={`flex flex-col gap-3 rounded-xl p-3 ${tone ? rowTones[tone] : "border border-border bg-white/70"}`}>
      {children}
    </li>
  );
}