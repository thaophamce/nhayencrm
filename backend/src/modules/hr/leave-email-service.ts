// SPDX-License-Identifier: AGPL-3.0-or-later
import nodemailer from 'nodemailer';
import { logger } from '../../shared/utils/logger.js';

const ADMIN_EMAIL = process.env.LEAVE_ADMIN_EMAIL || 'thaophamce@gmail.com';
const TYPE_LABEL: Record<string, string> = { normal: 'Nghỉ phép', multi_day: 'Nghỉ nhiều ngày', emergency: 'Nghỉ khẩn cấp' };
const SESSION_LABEL: Record<string, string> = { morning: 'Buổi sáng', afternoon: 'Buổi chiều', full: 'Cả ngày', multi: 'Nhiều ngày' };

export interface LeaveEmailData {
  staffName: string;
  employeeEmail?: string | null;
  type: string;
  session: string;
  startDate: string;
  endDate: string;
  reason: string;
  status?: string;
  reviewNote?: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function dateRange(startDate: string, endDate: string): string {
  return startDate === endDate ? displayDate(startDate) : `${displayDate(startDate)} – ${displayDate(endDate)}`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:10px;border:1px solid #e5e7eb;font-weight:600;width:160px">${label}</td><td style="padding:10px;border:1px solid #e5e7eb">${escapeHtml(value)}</td></tr>`;
}

function frame(title: string, color: string, intro: string, rows: string, action = ''): string {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;color:#1f2937"><h2 style="margin-top:0;padding-bottom:10px;border-bottom:2px solid ${color}">${title}</h2><p style="line-height:1.6">${intro}</p><table style="width:100%;border-collapse:collapse;margin-top:15px">${rows}</table>${action}<div style="margin-top:28px;padding-top:10px;border-top:1px solid #edf2f7;text-align:center;font-size:12px;color:#94a3b8">Hệ thống quản lý nhân sự Nhà Yến</div></div>`;
}

export function buildNewLeaveEmail(data: LeaveEmailData): { subject: string; html: string } {
  const name = data.staffName || 'Nhân viên';
  const rows = [row('Nhân sự', name), row('Loại nghỉ', TYPE_LABEL[data.type] || data.type), row('Thời gian', dateRange(data.startDate, data.endDate)), row('Buổi nghỉ', SESSION_LABEL[data.session] || data.session), row('Lý do', data.reason || '(không có)')].join('');
  const appUrl = (process.env.APP_URL || 'https://nhayencrm.com').replace(/\/$/, '');
  const action = `<div style="margin-top:24px;text-align:center"><a href="${escapeHtml(appUrl)}/salary?tab=leaveAdmin" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#1976d2;color:#fff;text-decoration:none;font-weight:600">Đi tới trang duyệt đơn nghỉ</a></div>`;
  return { subject: `[ĐƠN XIN NGHỈ PHÉP] - ${name}`, html: frame('Yêu cầu xin nghỉ phép mới', '#1976d2', 'Hệ thống vừa nhận một đơn xin nghỉ phép mới:', rows, action) };
}

export function buildReviewedLeaveEmail(data: LeaveEmailData): { subject: string; html: string } {
  const approved = data.status === 'approved';
  const result = approved ? 'ĐÃ ĐƯỢC DUYỆT' : 'BỊ TỪ CHỐI';
  const rows = [row('Loại nghỉ', TYPE_LABEL[data.type] || data.type), row('Thời gian', dateRange(data.startDate, data.endDate)), row('Kết quả', result), ...(data.reviewNote ? [row('Phản hồi quản lý', data.reviewNote)] : [])].join('');
  const intro = `Chào <strong>${escapeHtml(data.staffName || 'Nhân viên')}</strong>, đơn xin nghỉ phép của bạn đã có phản hồi từ quản lý:`;
  return { subject: `[KẾT QUẢ NGHỈ PHÉP] - ${result}`, html: frame('Kết quả duyệt đơn xin nghỉ phép', approved ? '#16a34a' : '#dc2626', intro, rows) };
}

function createMailer() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return user && pass ? nodemailer.createTransport({ service: 'gmail', auth: { user, pass } }) : null;
}

async function deliver(to: string, message: { subject: string; html: string }): Promise<boolean> {
  const transporter = createMailer();
  const from = process.env.SMTP_USER;
  if (!transporter || !from) {
    logger.warn('[leave-email] SMTP_USER/SMTP_PASS chưa cấu hình; bỏ qua gửi email');
    return false;
  }
  try {
    await transporter.sendMail({ from: `"Nhà Yến CRM" <${from}>`, to, ...message });
    return true;
  } catch (error) {
    logger.warn('[leave-email] Gửi email thất bại; đơn nghỉ vẫn được lưu:', error);
    return false;
  }
}

export function sendNewLeaveEmail(data: LeaveEmailData): Promise<boolean> {
  return deliver(ADMIN_EMAIL, buildNewLeaveEmail(data));
}

export function sendReviewedLeaveEmail(data: LeaveEmailData): Promise<boolean> {
  if (!data.employeeEmail) {
    logger.warn('[leave-email] Nhân viên chưa có email; bỏ qua phản hồi đơn nghỉ');
    return Promise.resolve(false);
  }
  return deliver(data.employeeEmail, buildReviewedLeaveEmail(data));
}
