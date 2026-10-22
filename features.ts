// Feature switches, set per environment in Vercel so no commit is needed.
// NEXT_PUBLIC_ values are fixed at build time, so redeploy after changing one.

/** "true", "1", "on" or "yes" (any case) is on; any other value is off; unset uses the default. */
function flag(value: string | undefined, defaultOn: boolean): boolean {
  const text = value?.trim().toLowerCase();
  if (!text) return defaultOn;
  return ["true", "1", "on", "yes"].includes(text);
}

/** Demo mode: saved AI results labeled "Demo"; draftReply stays live. Default off. */
export const DEMO_MODE = flag(process.env.NEXT_PUBLIC_DEMO_MODE, false);

/** Margin alarm: flag underwater quotes after a receipt changes costs. Default on. */
export const MARGIN_ALARM = flag(process.env.NEXT_PUBLIC_MARGIN_ALARM, true);
