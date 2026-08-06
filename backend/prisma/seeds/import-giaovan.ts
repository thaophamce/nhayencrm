// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
//
// import-giaovan.ts — nạp dữ liệu lương / chấm công / nghỉ phép từ dump Firebase RTDB
// (GIAOVAN nha-yen-webapp) vào CRM Postgres cho 6 nhân sự đã map sẵn.
//
// Mặc định DRY-RUN (chỉ in, KHÔNG ghi DB). Ghi thật: thêm cờ  --commit
//   npx tsx --env-file=.env prisma/seeds/import-giaovan.ts
//   npx tsx --env-file=.env prisma/seeds/import-giaovan.ts --commit
//
// Nguồn dump: đối số thứ 1, mặc định C:\Users\Admin\Downloads\nhayen-...-export.json
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const COMMIT = process.argv.includes('--commit');
const DUMP_PATH =
  process.argv.find((a) => a.endsWith('.json')) ??
  'C:\\Users\\Admin\\Downloads\\nhayen-giaovan-90a84-default-rtdb-export.json';

// GIAOVAN uid → CRM login (email đã đổi ở set-hr-usernames.ts).
const UID_TO_LOGIN: Record<string, string> = {
  QIMhGl2Twzb9m7xVdHI9ggjbFjt2: 'linh',
  gtsmwTegbpMWk4Uf2G6JFw4r4MJ3: 'vy',
  q4c4BngAjKYhvrmCVt9VMt8eYCh2: 'theanh',
  rFhbTI66B0SycNJcBqhaL0iXquG3: 'khang',
  staff_binh_manual: 'binh',
  vcgFk4TuYDMpxUNqOEiOqgovUJk1: 'rola',
};

// Bảo hiểm mặc định GIAOVAN (khớp DEFAULT_HR_CONFIG.insurance).
const INSURANCE = { bhxh: 456000, bhyt: 85500, bhtn: 57000 };
const INSURANCE_TOTAL = INSURANCE.bhxh + INSURANCE.bhyt + INSURANCE.bhtn; // 598500
const WORKING_DAYS = 26;
const OT_MONTHLY_HOURS = 208;

const n = (v: unknown, d = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

// Công thức lương GIAOVAN (source-of-truth) — tính bằng workDays THẬT (float) để khớp số hiển thị.
function computeSalary(r: any, workDays: number) {
  const baseSalary = n(r.baseSalary);
  const overtimeHours = n(r.overtimeHours);
  const overtimeSundayHours = n(r.overtimeSundayHours);
  const kpiAmount = n(r.kpiAmount);
  const allowanceAmount = n(r.allowanceAmount);
  const advanceAmount = n(r.advanceAmount);
  const fillOrderAmount = n(r.fillOrderAmount);
  const hasInsurance = r.hasInsurance === true;

  const thanhTien = Math.round((baseSalary * workDays) / WORKING_DAYS);
  const overtimeAmount = Math.round(
    (baseSalary / OT_MONTHLY_HOURS) * (overtimeHours * 1.5 + overtimeSundayHours * 2.0),
  );
  const insuranceAmount = hasInsurance ? INSURANCE_TOTAL : 0;
  const totalSalary = thanhTien + overtimeAmount + kpiAmount + allowanceAmount;
  const netSalary = totalSalary - advanceAmount - fillOrderAmount - insuranceAmount;

  return {
    baseSalary, overtimeHours, overtimeSundayHours, kpiAmount, allowanceAmount,
    advanceAmount, fillOrderAmount, hasInsurance, thanhTien, overtimeAmount,
    insuranceAmount, totalSalary, netSalary, workDaysRaw: workDays,
  };
}

const vnd = (x: number) => x.toLocaleString('vi-VN');

async function main() {
  const dump = JSON.parse(readFileSync(DUMP_PATH, 'utf8'));
  console.log(`\n=== IMPORT GIAOVAN → CRM  [${COMMIT ? 'COMMIT (ghi DB)' : 'DRY-RUN (thử)'}]`);
  console.log(`Dump: ${DUMP_PATH}\n`);

  // Org (chỉ 1 org Nhà Yến).
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('Không tìm thấy Organization.');
  console.log(`Org: ${org.name} (${org.id})`);

  // login → userId (map người thật).
  const logins = Object.values(UID_TO_LOGIN);
  const users = await prisma.user.findMany({
    where: { orgId: org.id, email: { in: logins } },
    select: { id: true, email: true, fullName: true },
  });
  const loginToUser = new Map(users.map((u) => [u.email!, u]));
  const uidToUser = new Map<string, { id: string; fullName: string }>();
  for (const [uid, login] of Object.entries(UID_TO_LOGIN)) {
    const u = loginToUser.get(login);
    if (u) uidToUser.set(uid, { id: u.id, fullName: u.fullName });
    else console.log(`  ⚠ login "${login}" chưa có trong CRM — bỏ qua uid ${uid}`);
  }

  // Số công tháng 6 từ chấm công (cho user không ghi workDays trong phiếu lương).
  const att = dump.attendance_records ?? {};
  const juneWorkDays = new Map<string, number>();
  for (const [uid, byDate] of Object.entries<any>(att)) {
    const ds = new Set<string>();
    for (const [date, byShift] of Object.entries<any>(byDate)) {
      for (const sh of Object.keys(byShift)) {
        if (date.startsWith('2026-06') && (sh === 'morning' || sh === 'afternoon')) ds.add(date);
      }
    }
    juneWorkDays.set(uid, ds.size);
  }

  // ── 1) LƯƠNG 2026-06 ────────────────────────────────────────────────────────
  console.log('\n── LƯƠNG kỳ 2026-06 ──');
  const salMonth = dump.salary_records?.['2026-06'] ?? {};
  let salN = 0;
  for (const [uid, raw] of Object.entries<any>(salMonth)) {
    const u = uidToUser.get(uid);
    if (!u) continue;
    const workDays = raw.workDays != null ? n(raw.workDays) : (juneWorkDays.get(uid) ?? 0);
    const c = computeSalary(raw, workDays);
    console.log(
      `  ${u.fullName.padEnd(22)} | công ${String(workDays).padStart(4)}/26 | base ${vnd(c.baseSalary).padStart(10)} | ` +
      `TC ${vnd(c.overtimeAmount).padStart(9)} | tổng ${vnd(c.totalSalary).padStart(11)} | THỰC NHẬN ${vnd(c.netSalary).padStart(11)}` +
      (c.hasInsurance ? ' | +BH' : ''),
    );
    if (COMMIT) {
      const data = {
        orgId: org.id, userId: u.id, period: '2026-06',
        baseSalary: Math.round(c.baseSalary),
        workDays: Math.round(workDays),           // cột Int (Rola 24.5 → 25); tiền tính từ workDays thật
        workingDays: WORKING_DAYS,
        overtimeHours: c.overtimeHours, overtimeSundayHours: c.overtimeSundayHours,
        kpiAmount: Math.round(c.kpiAmount), allowanceAmount: Math.round(c.allowanceAmount),
        advanceAmount: Math.round(c.advanceAmount), fillOrderAmount: Math.round(c.fillOrderAmount),
        hasInsurance: c.hasInsurance, overtimeAmount: c.overtimeAmount, thanhTien: c.thanhTien,
        totalSalary: c.totalSalary, netSalary: c.netSalary, isManualOverride: true,
      };
      await prisma.salaryRecord.upsert({
        where: { orgId_userId_period: { orgId: org.id, userId: u.id, period: '2026-06' } },
        create: data, update: data,
      });
    }
    salN++;
  }
  console.log(`  → ${salN} phiếu lương`);

  // ── 2) CHẤM CÔNG ────────────────────────────────────────────────────────────
  console.log('\n── CHẤM CÔNG ──');
  let attN = 0, attSkip = 0;
  const perUser = new Map<string, number>();
  for (const [uid, byDate] of Object.entries<any>(att)) {
    const u = uidToUser.get(uid);
    if (!u) { for (const bs of Object.values<any>(byDate)) attSkip += Object.keys(bs).length; continue; }
    for (const [date, byShift] of Object.entries<any>(byDate)) {
      for (const [shift, rec] of Object.entries<any>(byShift)) {
        if (!['morning', 'afternoon', 'overtime'].includes(shift)) { attSkip++; continue; }
        const status = rec.status === 'late' ? 'late' : 'on_time';
        const data = {
          orgId: org.id, userId: u.id, date, shift, status,
          checkinTime: new Date(n(rec.checkinTime, Date.parse(date))),
          lateMinutes: Math.max(0, Math.round(n(rec.lateMinutes))),
          lateReason: rec.lateReason ?? rec.reason ?? null,
          clientIp: rec.clientIp ?? null,
        };
        if (COMMIT) {
          await prisma.attendanceRecord.upsert({
            where: { orgId_userId_date_shift: { orgId: org.id, userId: u.id, date, shift } },
            create: data, update: data,
          });
        }
        attN++; perUser.set(u.fullName, (perUser.get(u.fullName) ?? 0) + 1);
      }
    }
  }
  for (const [name, cnt] of perUser) console.log(`  ${name.padEnd(22)} | ${cnt} ca`);
  console.log(`  → ${attN} bản ghi chấm công (bỏ qua ${attSkip} của uid không map)`);

  // ── 3) NGHỈ PHÉP ────────────────────────────────────────────────────────────
  console.log('\n── NGHỈ PHÉP ──');
  const owner = await prisma.user.findFirst({ where: { orgId: org.id, role: 'owner' }, select: { id: true } });
  const leave = dump.leave_requests ?? {};
  const VALID_TYPE = ['normal', 'multi_day', 'emergency'];
  const VALID_SESSION = ['morning', 'afternoon', 'full', 'multi'];
  const VALID_STATUS = ['pending', 'approved', 'rejected'];
  let lvN = 0, lvSkip = 0;
  for (const [uid, byId] of Object.entries<any>(leave)) {
    const u = uidToUser.get(uid);
    if (!u) { lvSkip += Object.keys(byId).length; continue; }
    for (const [pushId, r] of Object.entries<any>(byId)) {
      const type = VALID_TYPE.includes(r.leaveType) ? r.leaveType : 'normal';
      const session = VALID_SESSION.includes(r.session) ? r.session : 'full';
      const status = VALID_STATUS.includes(r.status) ? r.status : 'pending';
      const reviewed = status !== 'pending';
      const data = {
        orgId: org.id, userId: u.id, type, session,
        startDate: String(r.startDate), endDate: String(r.endDate ?? r.startDate),
        reason: String(r.reason ?? ''), status,
        reviewedById: reviewed ? (owner?.id ?? null) : null,
        reviewedAt: reviewed ? new Date(n(r.updatedAt, n(r.createdAt, Date.now()))) : null,
        reviewNote: r.reviewNote ?? null,
        createdAt: new Date(n(r.createdAt, Date.now())),
      };
      if (COMMIT) {
        // Không có unique tự nhiên → tránh nhân bản khi chạy lại: khoá theo (user,startDate,session,createdAt).
        const dup = await prisma.leaveRequest.findFirst({
          where: { orgId: org.id, userId: u.id, startDate: data.startDate, session, createdAt: data.createdAt },
          select: { id: true },
        });
        if (dup) await prisma.leaveRequest.update({ where: { id: dup.id }, data });
        else await prisma.leaveRequest.create({ data });
      }
      console.log(`  ${u.fullName.padEnd(22)} | ${data.startDate}→${data.endDate} | ${session.padEnd(9)} | ${status}`);
      lvN++;
    }
  }
  console.log(`  → ${lvN} đơn nghỉ (bỏ qua ${lvSkip} của uid không map)`);

  console.log(`\n=== ${COMMIT ? 'ĐÃ GHI DB.' : 'DRY-RUN xong — chưa ghi gì. Thêm --commit để ghi thật.'}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
