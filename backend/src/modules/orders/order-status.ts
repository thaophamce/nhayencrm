// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
export const ORDER_STATUS_VALUES = ['demo', 'designing', 'approved', 'cancelled'] as const;

export type OrderStatusValue = typeof ORDER_STATUS_VALUES[number];

const ORDER_STATUS_GROUP_LABELS: Record<OrderStatusValue, string> = {
  demo: 'chưa demo',
  designing: 'đang thiết kế',
  approved: 'chốt in',
  cancelled: 'khách huỷ',
};

export function getOrderStatusGroupLabel(status: string): string {
  return ORDER_STATUS_GROUP_LABELS[status as OrderStatusValue] ?? status;
}

export function buildOrderGroupName(orderCode: string, status: string): string {
  return `${orderCode.trim()} ${getOrderStatusGroupLabel(status)}`.trim();
}
