/**
 * Billing math for Indian restaurants. All monetary values are integer paise
 * (named *Cents for currency neutrality) and all rates are basis points
 * (5% GST = 500 bps) so there is no floating point drift.
 *
 * GST on restaurant service is charged on top of menu prices and, for
 * intra-state supply, split equally into CGST and SGST.
 */

export interface BillLine {
  unitPriceCents: number;
  quantity: number;
  /** GST rate in bps (e.g. 500 = 5%). */
  taxRateBps: number;
  /** Price of selected add-ons per unit. */
  modifiersCents?: number;
}

export type BillDiscount = { type: 'FLAT'; amountCents: number } | { type: 'PERCENT'; bps: number };

export interface BillInput {
  lines: BillLine[];
  discount?: BillDiscount | null;
  serviceChargeBps: number;
  /** Round the payable amount to the nearest rupee (standard on Indian bills). */
  roundOff?: boolean;
}

export interface TaxBucket {
  rateBps: number;
  taxableCents: number;
  taxCents: number;
}

export interface BillTotals {
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  taxCents: number;
  roundOffCents: number;
  totalCents: number;
}

export interface BillDetail extends BillTotals {
  /** Tax grouped by GST rate; buckets sum exactly to taxCents. */
  taxBreakdown: TaxBucket[];
}

/** Round half away from zero — the convention on GST invoices. */
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
 * before tax. Service charge (if any) is computed on the discounted subtotal and
 * attributed to each GST rate in proportion to that rate's share of the bill.
 */
export function computeBillDetail(input: BillInput): BillDetail {
  const lineTotals = input.lines.map(lineTotal);
  const subtotalCents = lineTotals.reduce((a, b) => a + b, 0);

  let discountCents = 0;
  if (input.discount && subtotalCents > 0) {
    discountCents = input.discount.type === 'FLAT'
      ? input.discount.amountCents
      : applyBps(subtotalCents, input.discount.bps);
    discountCents = Math.max(0, Math.min(discountCents, subtotalCents));
  }
  const discountedSubtotal = subtotalCents - discountCents;
  const serviceChargeCents = applyBps(discountedSubtotal, input.serviceChargeBps);

  // Exact taxable base per rate (before rounding).
  const buckets = new Map<number, number>();
  input.lines.forEach((line, i) => {
    const lt = lineTotals[i] ?? 0;
    const share = subtotalCents > 0 ? lt / subtotalCents : 0;
    const taxable = lt - discountCents * share + serviceChargeCents * share;
    buckets.set(line.taxRateBps, (buckets.get(line.taxRateBps) ?? 0) + taxable);
  });

  const exact = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  const taxExactTotal = exact.reduce((a, [rate, base]) => a + (base * rate) / 10_000, 0);
  const taxCents = roundHalfUp(taxExactTotal);

  // Largest-remainder rounding so bucket taxes sum exactly to taxCents.
  const raw = exact.map(([rate, base]) => ({ rate, base, tax: (base * rate) / 10_000 }));
  const floored = raw.map((r) => Math.floor(r.tax));
  let remainder = taxCents - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r.tax - Math.floor(r.tax) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i]! += 1;
    remainder -= 1;
  }
  const taxBreakdown: TaxBucket[] = raw
    .map((r, i) => ({ rateBps: r.rate, taxableCents: roundHalfUp(r.base), taxCents: floored[i]! }))
    .filter((b) => b.taxableCents > 0 || b.taxCents > 0);

  const beforeRound = discountedSubtotal + serviceChargeCents + taxCents;
  const roundOffCents = input.roundOff ? roundHalfUp(beforeRound / 100) * 100 - beforeRound : 0;

  return {
    subtotalCents,
    discountCents,
    serviceChargeCents,
    taxCents,
    roundOffCents,
    totalCents: beforeRound + roundOffCents,
    taxBreakdown,
  };
}

export function computeBill(input: BillInput): BillTotals {
  const { taxBreakdown: _ignored, ...totals } = computeBillDetail(input);
  return totals;
}

/** Split GST into CGST + SGST halves (intra-state supply). SGST takes any odd paisa. */
export function splitGst(taxCents: number): { cgstCents: number; sgstCents: number } {
  const cgstCents = Math.floor(taxCents / 2);
  return { cgstCents, sgstCents: taxCents - cgstCents };
}

/** Indian financial year label for a date in Asia/Kolkata, e.g. "2526" for FY 2025-26. */
export function financialYear(date: Date, timeZone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const start = month >= 4 ? year : year - 1;
  return `${String(start % 100).padStart(2, '0')}${String((start + 1) % 100).padStart(2, '0')}`;
}

export function formatMoney(cents: number, currency = 'INR', locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
