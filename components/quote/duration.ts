// Time-to-quote as the florist reads it. Shared by the reply screen and the quote list.
import { t } from "@/lib/strings";

/** Whole seconds in their largest two units: "45 seg", "4 min 12 seg", "1 oras 5 min". */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = hours
    ? [t("duration", "hours", { n: hours }), minutes ? t("duration", "minutes", { n: minutes }) : null]
    : minutes
      ? [t("duration", "minutes", { n: minutes }), seconds ? t("duration", "seconds", { n: seconds }) : null]
      : [t("duration", "seconds", { n: seconds })];
  return parts.filter((p) => p !== null).join(" ");
}
