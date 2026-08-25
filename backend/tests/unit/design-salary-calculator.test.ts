import { describe, expect, it } from 'vitest';
import {
  calculateImportedMonthlySalaryStats,
  fileDeltaForMonth,
  type ImportedDesignOrderSalaryInput,
} from '../../src/modules/orders/design-salary-calculator.js';

const base: ImportedDesignOrderSalaryInput = {
  designerId: 'designer-1', fileCount: 0, fileCountHistory: [],
  timestamps: { designing: '2026-05-01T00:00:00.000Z' },
  status: 'designing', hasDesignFee: false, designFeeTickedAt: null,
};

describe('design salary calculator', () => {
  it('uses the last count in a month instead of summing history snapshots', () => {
    const order = { ...base, fileCountHistory: [
      { count: 5, changedAt: '2026-07-03T00:00:00.000Z' },
      { count: 8, changedAt: '2026-07-20T00:00:00.000Z' },
    ] };
    expect(fileDeltaForMonth(order, '2026-07')).toBe(8);
  });

  it('calculates only the increase from the previous month and never a negative delta', () => {
    const increased = { ...base, fileCountHistory: [
      { count: 5, changedAt: '2026-06-03T00:00:00.000Z' },
      { count: 8, changedAt: '2026-07-20T00:00:00.000Z' },
    ] };
    const decreased = { ...base, fileCountHistory: [
      { count: 8, changedAt: '2026-06-03T00:00:00.000Z' },
      { count: 5, changedAt: '2026-07-20T00:00:00.000Z' },
    ] };
    expect(fileDeltaForMonth(increased, '2026-07')).toBe(3);
    expect(fileDeltaForMonth(decreased, '2026-07')).toBe(0);
  });

  it('does not pay file salary before the order has a designing timestamp', () => {
    const order = {
      ...base,
      timestamps: {},
      fileCountHistory: [{ count: 8, changedAt: '2026-07-20T00:00:00.000Z' }],
    };
    expect(fileDeltaForMonth(order, '2026-07')).toBe(0);
  });

  it('matches TRACKER rules for approved, design fee fallback, and order count', () => {
    const stats = calculateImportedMonthlySalaryStats([
      {
        ...base, fileCount: 5, fileCountHistory: null, hasDesignFee: true,
        status: 'approved',
        timestamps: {
          designing: '2026-07-01T00:00:00.000Z',
          approved: '2026-07-10T00:00:00.000Z',
        },
      },
      {
        ...base, status: 'cancelled',
        timestamps: { approved: '2026-07-11T00:00:00.000Z' },
      },
    ], '2026-07').get('designer-1');

    expect(stats).toEqual({ orderCount: 2, totalFiles: 5, approvedCount: 1, designFeeCount: 1 });
  });

  it('excludes designers without salary activity in the selected month', () => {
    const stats = calculateImportedMonthlySalaryStats([{
      ...base,
      fileCount: 5,
      timestamps: { designing: '2026-06-01T00:00:00.000Z' },
    }], '2026-07');

    expect(stats.has('designer-1')).toBe(false);
  });

  it('includes designers whose only salary activity is a design fee', () => {
    const stats = calculateImportedMonthlySalaryStats([{
      ...base,
      fileCount: 0,
      hasDesignFee: true,
      designFeeTickedAt: '2026-07-15T00:00:00.000Z',
    }], '2026-07');

    expect(stats.get('designer-1')).toEqual({
      orderCount: 0,
      totalFiles: 0,
      approvedCount: 0,
      designFeeCount: 1,
    });
  });
});
