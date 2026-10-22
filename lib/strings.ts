// Typed access to content/strings.json (spec decision 23). Keys come from the
// JSON file itself, so a missing screen or key fails the type check.

import strings from "@/content/strings.json";

type Strings = typeof strings;
export type Screen = keyof Strings;

/** A label for a screen, with `{name}` placeholders filled from `vars`. */
export function t<S extends Screen>(
  screen: S,
  key: keyof Strings[S] & string,
  vars?: Record<string, string | number>,
): string {
  const labels: Record<string, string> | undefined = strings[screen];
  if (!labels || !Object.hasOwn(labels, key)) return `${screen}.${key}`;
  const text = labels[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : placeholder,
  );
}
