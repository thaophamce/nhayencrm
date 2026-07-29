// SPDX-License-Identifier: AGPL-3.0-or-later
export const PAYMENT_STATUSES = ['unpaid', 'deposited', 'paid'] as const;
export const DELIVERY_METHODS = ['viettelpost', 'grab', 'chanh-xe', 'pickup'] as const;
export const DELIVERY_STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'failed', 'returned', 'cancelled'] as const;

export function isAllowed(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === 'string' && allowed.includes(value);
}
export function amount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : -1;
}
export function cleanText(value: unknown, max = 1000): string | null {
  if (value == null || value === '') return null;
  return String(value).trim().slice(0, max) || null;
}
