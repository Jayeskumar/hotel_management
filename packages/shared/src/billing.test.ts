import { describe, expect, it } from 'vitest';
import { computeBill, applyBps } from './billing.js';
import { can, assignableRoles } from './permissions.js';

describe('computeBill', () => {
  it('computes subtotal, tax and total with no discount', () => {
    const t = computeBill({
      lines: [
        { unitPriceCents: 1000, quantity: 2, taxRateBps: 500 },
        { unitPriceCents: 500, quantity: 1, taxRateBps: 500, modifiersCents: 100 },
      ],
      serviceChargeBps: 0,
    });
    expect(t.subtotalCents).toBe(2600);
    expect(t.taxCents).toBe(130);
    expect(t.totalCents).toBe(2730);
  });

  it('applies percentage discount before tax and service charge', () => {
    const t = computeBill({
      lines: [{ unitPriceCents: 10000, quantity: 1, taxRateBps: 1000 }],
      discount: { type: 'PERCENT', bps: 1000 },
      serviceChargeBps: 1000,
    });
    expect(t.discountCents).toBe(1000);
    expect(t.serviceChargeCents).toBe(900);
    // tax: 10% of 9000 + 10% of 900
    expect(t.taxCents).toBe(990);
    expect(t.totalCents).toBe(9000 + 900 + 990);
  });

  it('never discounts beyond the subtotal', () => {
    const t = computeBill({
      lines: [{ unitPriceCents: 500, quantity: 1, taxRateBps: 0 }],
      discount: { type: 'FLAT', amountCents: 9999 },
      serviceChargeBps: 0,
    });
    expect(t.discountCents).toBe(500);
    expect(t.totalCents).toBe(0);
  });

  it('handles mixed tax rates', () => {
    const t = computeBill({
      lines: [
        { unitPriceCents: 1000, quantity: 1, taxRateBps: 500 },
        { unitPriceCents: 1000, quantity: 1, taxRateBps: 1800 },
      ],
      serviceChargeBps: 0,
    });
    expect(t.taxCents).toBe(230);
  });

  it('returns zeros for an empty order', () => {
    expect(computeBill({ lines: [], serviceChargeBps: 1000 }).totalCents).toBe(0);
  });

  it('rounds half up', () => {
    expect(applyBps(25, 1000)).toBe(3);
  });
});

describe('permissions', () => {
  it('restricts roles', () => {
    expect(can('OWNER', 'outlet:manage')).toBe(true);
    expect(can('MANAGER', 'outlet:manage')).toBe(false);
    expect(can('WAITER', 'payments:refund')).toBe(false);
    expect(can('CHEF', 'kitchen:update')).toBe(true);
    expect(assignableRoles('MANAGER')).not.toContain('OWNER');
    expect(assignableRoles('WAITER')).toEqual([]);
  });
});
