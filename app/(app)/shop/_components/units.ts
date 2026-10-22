import { t } from "@/lib/strings";
import type { Unit } from "@/lib/types";

// Unit names live under "shop" for now, so this branch merges without #17. Once #17 is
// merged, switch to t("units", unit) and delete the shop.unit* keys.
const KEYS = { dozen: "unitDozen", per10: "unitPer10", bundle: "unitBundle", bunch: "unitBunch", piece: "unitPiece" } as const;

export const UNITS = Object.keys(KEYS) as Unit[];
export const unitName = (unit: Unit) => t("shop", KEYS[unit]);
