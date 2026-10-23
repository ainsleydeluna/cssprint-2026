export const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** "2026-10-22" → "Oct 22, 2026", read as a Manila date. */
export const formatDate = (isoDate: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(
    new Date(`${isoDate}T00:00:00+08:00`),
  );
