import { t } from "@/lib/strings";
import type { Unit } from "@/lib/types";

export const UNITS: Unit[] = ["dozen", "per10", "bundle", "bunch", "piece"];
export const unitName = (unit: Unit) => t("units", unit);
