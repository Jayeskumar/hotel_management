/**
 * Billing math. All monetary values are integer minor units (e.g. cents/paise)
 * and all rates are basis points (1% = 100 bps) to avoid floating point drift.
 */

export interface BillLine {
  unitPriceCents: number;
  quantity: number;
  /** Line tax rate in bps. */
  taxRateBps: number;
  /** Price of selected modifiers per unit. */
  modifiersCents?: number;
}

export interface BillInput {
  lines: BillLine[];
  /** Order-level discount, either a flat amount or a percentage (bps). */
  discount?: { type: 'FLAT'; amountCents: number } | { type: 'PERCENT'; bps: number } | null;
  serviceChargeBps: number;
}

export interface BillTotals {
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  taxCents: number;
  totalCents: number;
}

/** Round half away from zero — the convention used on most fiscal receipts. */
export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

export function applyBps(amount: number, bps: number): number {
  return roundHalfUp((amount * bps) / 10_000);
}

export function lineTotal(line: BillLine): number {
  return (line.unitPriceCents + (line.modifiersCents ?? 0)) * line.quantity;
}

/**
 * Discount is applied to the subtotal and allocated proportionally across lines
 * before tax, so tax is charged on the discounted amount. Service charge is
 * computed on the discounted subtotal and taxed at the weighted line rate.
 */
export function computeBill(input: BillInput): BillTotals {
  const lineTotals = input.lines.map(lineTotal);
  const subtotalCents = lineTotals.reduce((a, b) => a + b, 0);

  let discountCents = 0;
  if (input.discount && subtotalCents > 0) {
    discountCents =
      input.discount.type === 'FLAT'
        ? input.discount.amountCents
        : applyBps(subtotalCents, input.discount.bps);
    discountCents = Math.max(0, Math.min(discountCents, subtotalCents));
  }

  const discountedSubtotal = subtotalCents - discountCents;
  const serviceChargeCents = applyBps(discountedSubtotal, input.serviceChargeBps);

  // Tax per line on its share of the discounted subtotal.
  let lineTaxExact = 0;
  let weightedTaxBase = 0;
  input.lines.forEach((line, i) => {
    const lt = lineTotals[i] ?? 0;
    const share = subtotalCents > 0 ? lt / subtotalCents : 0;
    const taxableLine = lt - discountCents * share;
    lineTaxExact += (taxableLine * line.taxRateBps) / 10_000;
    weightedTaxBase += share * line.taxRateBps;
  });
  const serviceTaxExact = (serviceChargeCents * weightedTaxBase) / 10_000;
  const taxCents = roundHalfUp(lineTaxExact + serviceTaxExact);

  return {
    subtotalCents,
    discountCents,
    serviceChargeCents,
    taxCents,
    totalCents: discountedSubtotal + serviceChargeCents + taxCents,
  };
}

export function formatMoney(cents: number, currency = 'USD', locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
