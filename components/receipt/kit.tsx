// Temporary building blocks for Pat's screens until Ian's components/ui (#13) lands.
// Swapping to components/ui means changing the imports of this one file.
// Shared by the receipt and shop branches as one commit: don't edit it on just one branch.
import type { ComponentProps, ReactNode } from "react";

const buttonStyles = {
  primary: "bg-green-800 text-white",
  secondary: "border border-zinc-300 dark:border-zinc-700",
  danger: "border border-red-300 text-red-700 dark:border-red-800 dark:text-red-400",
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
      className={`min-h-12 rounded-xl px-4 font-semibold disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
    />
  );
}

// text-base (16px) stops iPhones zooming in when a field is focused.
const fieldStyles =
  "min-h-12 w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3 text-base dark:border-zinc-700 dark:bg-zinc-950";

type FieldProps = { label: string; hint?: string };

function Field({ label, hint, children }: FieldProps & { children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-zinc-500 dark:text-zinc-400">{hint}</span>}
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

/** One item in a list. `highlight` marks a line that needs the florist's attention. */
export function Row({ highlight = false, children }: { highlight?: boolean; children: ReactNode }) {
  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border p-3 ${
        highlight
          ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {children}
    </li>
  );
}
