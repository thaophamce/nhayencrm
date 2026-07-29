// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
export interface OrderStatusOption {
  value: string;
  label: string;
  color: string;
}

export const ORDER_STATUS_OPTIONS: OrderStatusOption[] = [
  { value: 'demo', label: 'Chưa demo', color: '#F57C00' },
  { value: 'designing', label: 'Đang thiết kế', color: '#2F80ED' },
  { value: 'approved', label: 'Chốt in', color: '#34A853' },
  { value: 'cancelled', label: 'Khách huỷ', color: '#E5484D' },
];

export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_OPTIONS.find(o => o.value === status)?.label ?? status;
}

export function getOrderStatusColor(status: string): string {
  return ORDER_STATUS_OPTIONS.find(o => o.value === status)?.color ?? 'grey';
}
