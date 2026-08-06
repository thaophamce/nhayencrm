// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * hr.ts — hằng số nhân sự (chấm công / nghỉ phép / lương).
 * Mirror giá trị enum backend (hr-config.ts, leave-controller.ts).
 */

export type ShiftKey = 'morning' | 'afternoon' | 'overtime';

export const SHIFTS: Array<{ key: ShiftKey; label: string; icon: string }> = [
  { key: 'morning', label: 'Ca sáng', icon: 'mdi-weather-sunny' },
  { key: 'afternoon', label: 'Ca chiều', icon: 'mdi-weather-partly-cloudy' },
  { key: 'overtime', label: 'Tăng ca', icon: 'mdi-weather-night' },
];

export const SHIFT_LABEL: Record<string, string> = {
  morning: 'Ca sáng',
  afternoon: 'Ca chiều',
  overtime: 'Tăng ca',
};

export const ATTENDANCE_STATUS: Record<string, { label: string; color: string }> = {
  on_time: { label: 'Đúng giờ', color: 'success' },
  late: { label: 'Đi trễ', color: 'warning' },
};

export const LEAVE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'normal', label: 'Nghỉ phép' },
  { value: 'multi_day', label: 'Nghỉ nhiều ngày' },
  { value: 'emergency', label: 'Nghỉ khẩn cấp' },
];

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  normal: 'Nghỉ phép',
  multi_day: 'Nghỉ nhiều ngày',
  emergency: 'Nghỉ khẩn cấp',
};

export const LEAVE_SESSIONS: Array<{ value: string; label: string }> = [
  { value: 'morning', label: 'Buổi sáng' },
  { value: 'afternoon', label: 'Buổi chiều' },
  { value: 'full', label: 'Cả ngày' },
  { value: 'multi', label: 'Nhiều ngày' },
];

export const LEAVE_SESSION_LABEL: Record<string, string> = {
  morning: 'Buổi sáng',
  afternoon: 'Buổi chiều',
  full: 'Cả ngày',
  multi: 'Nhiều ngày',
};

export const LEAVE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Chờ duyệt', color: 'grey' },
  approved: { label: 'Đã duyệt', color: 'success' },
  rejected: { label: 'Từ chối', color: 'error' },
};

/** Format VND — mẫu DesignerSalaryReport (thay ₫ → đ). */
export function formatVnd(value: number | null | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '0đ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
    .format(value)
    .replace('₫', 'đ');
}

/** 'YYYY-MM' → 'MM/YYYY'. */
export function formatMonthLabel(monthStr: string): string {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return `${m}/${y}`;
}

/** Kỳ hiện tại 'YYYY-MM' theo giờ VN. */
export function currentPeriod(): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Ngày hiện tại 'YYYY-MM-DD' theo giờ VN. */
export function currentDate(): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
