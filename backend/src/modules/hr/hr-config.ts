// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * hr-config.ts — cấu hình nhân sự (chấm công / lương) lưu JSON trên Organization.hrConfig.
 *
 * Nguồn nghiệp vụ: GIAOVAN/nha-yen-webapp (source-of-truth). Khi org chưa cấu hình
 * (hrConfig = null) → dùng DEFAULT_HR_CONFIG. Đọc luôn qua getHrConfig() để merge
 * default an toàn (org lưu thiếu field vẫn chạy).
 */

export type ShiftKey = 'morning' | 'afternoon' | 'overtime';

export interface ShiftTime {
  /** 'HH:mm' 24h — giờ bắt đầu ca (mốc tính trễ). */
  start: string;
  /** 'HH:mm' 24h — giờ kết thúc ca. */
  end: string;
}

export interface HrInsurance {
  bhxh: number;
  bhyt: number;
  bhtn: number;
}

export interface HrConfig {
  /** Danh sách IP/WiFi được phép chấm công (server-side verify). Rỗng = chấp nhận mọi IP. */
  allowedIps: string[];
  shifts: Record<ShiftKey, ShiftTime>;
  /** Số phút ân hạn — trong khoảng này vẫn tính đúng giờ. */
  graceMinutes: number;
  /** Số công chuẩn/tháng (mẫu số công thức lương). */
  workingDaysPerMonth: number;
  insurance: HrInsurance;
}

// Mặc định theo GIAOVAN: 3 ca, grace 15', BHXH/BHYT/BHTN chuẩn, 26 công/tháng.
export const DEFAULT_HR_CONFIG: HrConfig = {
  allowedIps: [],
  shifts: {
    morning: { start: '07:30', end: '11:30' },
    afternoon: { start: '13:30', end: '17:30' },
    overtime: { start: '19:30', end: '22:00' },
  },
  graceMinutes: 15,
  workingDaysPerMonth: 26,
  insurance: { bhxh: 456000, bhyt: 85500, bhtn: 57000 },
};

export const SHIFT_KEYS: ShiftKey[] = ['morning', 'afternoon', 'overtime'];

/** Merge cấu hình org (có thể null / thiếu field) lên default. */
export function normalizeHrConfig(raw: unknown): HrConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<HrConfig>;
  const shiftsSrc = (src.shifts && typeof src.shifts === 'object' ? src.shifts : {}) as Partial<
    Record<ShiftKey, ShiftTime>
  >;
  const shifts = {} as Record<ShiftKey, ShiftTime>;
  for (const k of SHIFT_KEYS) {
    const d = DEFAULT_HR_CONFIG.shifts[k];
    const s = shiftsSrc[k];
    shifts[k] = {
      start: s && typeof s.start === 'string' ? s.start : d.start,
      end: s && typeof s.end === 'string' ? s.end : d.end,
    };
  }
  const insSrc = (src.insurance && typeof src.insurance === 'object' ? src.insurance : {}) as Partial<HrInsurance>;
  return {
    allowedIps: Array.isArray(src.allowedIps) ? src.allowedIps.filter((x) => typeof x === 'string') : [],
    shifts,
    graceMinutes:
      typeof src.graceMinutes === 'number' && Number.isFinite(src.graceMinutes)
        ? src.graceMinutes
        : DEFAULT_HR_CONFIG.graceMinutes,
    workingDaysPerMonth:
      typeof src.workingDaysPerMonth === 'number' && src.workingDaysPerMonth > 0
        ? src.workingDaysPerMonth
        : DEFAULT_HR_CONFIG.workingDaysPerMonth,
    insurance: {
      bhxh: typeof insSrc.bhxh === 'number' ? insSrc.bhxh : DEFAULT_HR_CONFIG.insurance.bhxh,
      bhyt: typeof insSrc.bhyt === 'number' ? insSrc.bhyt : DEFAULT_HR_CONFIG.insurance.bhyt,
      bhtn: typeof insSrc.bhtn === 'number' ? insSrc.bhtn : DEFAULT_HR_CONFIG.insurance.bhtn,
    },
  };
}

/**
 * Kiểm client IP có nằm trong allowedIps không.
 * allowedIps rỗng → cho qua (org chưa siết IP). Chuẩn hoá IPv4-mapped IPv6 (::ffff:x).
 */
export function isIpAllowed(clientIp: string | undefined, allowedIps: string[]): boolean {
  if (!allowedIps || allowedIps.length === 0) return true;
  if (!clientIp) return false;
  const norm = clientIp.replace(/^::ffff:/, '').trim();
  return allowedIps.some((ip) => {
    const a = ip.replace(/^::ffff:/, '').trim();
    return a === norm || a === clientIp;
  });
}
