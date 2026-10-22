// Feature switches, set per environment in Vercel so no commit is needed.
// NEXT_PUBLIC_ values are fixed at build time, so redeploy after changing one.

/** Demo mode: saved AI results labeled "Demo"; draftReply stays live. Default off. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Margin alarm: flag underwater quotes after a receipt changes costs. Default on. */
export const MARGIN_ALARM = process.env.NEXT_PUBLIC_MARGIN_ALARM !== "false";
