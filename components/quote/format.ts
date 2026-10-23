// Quote screens show whole pesos ("₱3,780"): a price is always rounded up to ₱10 (lib/money.ts price).
const wholePeso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const peso = (amount: number) => wholePeso.format(amount);
