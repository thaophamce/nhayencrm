// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import { simpleParser, type Attachment } from 'mailparser';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { logger } from '../../shared/utils/logger.js';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_RECIPIENT = 'hoadonthiepcuoi@gmail.com';
const DEFAULT_CRON = '0 8 * * 1';
const DAY_MS = 86_400_000;
const MAX_MESSAGE_BYTES = 18 * 1024 * 1024;

export interface WeekRange {
  start: Date;
  end: Date;
  key: string;
  label: string;
}

interface InvoicePdf {
  filename: string;
  content: Buffer;
  messageId: string;
  subject: string;
  receivedAt: Date;
  sha256: string;
}

interface BillingState {
  sentWeeks: Record<string, { sentAt: string; pdfHashes: string[]; messageCount: number }>;
}

export interface WeeklyBillingResult {
  skipped: boolean;
  reason?: string;
  week: WeekRange;
  pdfCount: number;
  emailCount: number;
}

function formatVietnamDate(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function previousVietnamWeek(now = new Date()): WeekRange {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const day = shifted.getUTCDay() || 7;
  const currentMondayLocalAsUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - day + 1,
  );
  const end = new Date(currentMondayLocalAsUtc - 7 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  const lastDay = new Date(end.getTime() - 1);
  return {
    start,
    end,
    key: start.toISOString().slice(0, 10),
    label: `${formatVietnamDate(start)} - ${formatVietnamDate(lastDay)}`,
  };
}

export function isMetaBillingMessage(from: string, subject: string): boolean {
  const sender = from.toLocaleLowerCase('vi');
  const title = subject.toLocaleLowerCase('vi');
  const isMeta = /facebook(mail)?\.com|support\.facebook\.com|meta\.com/.test(sender)
    || /\b(meta|facebook)\b/.test(title);
  const isBilling = /invoice|receipt|payment|billing|h[oó]a đơn|bi[eê]n lai|thanh to[aá]n/.test(title);
  return isMeta && isBilling;
}

function safePdfFilename(value: string, index: number): string {
  const base = path.basename(value || `meta-invoice-${index + 1}.pdf`)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return base.toLocaleLowerCase('vi').endsWith('.pdf') ? base : `${base}.pdf`;
}

export function splitAttachmentsBySize<T extends { content: Buffer }>(items: T[]): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;
  for (const item of items) {
    if (current.length && currentBytes + item.content.length > MAX_MESSAGE_BYTES) {
      groups.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.content.length;
  }
  if (current.length) groups.push(current);
  return groups;
}

function statePath(): string {
  const root = process.env.UPLOAD_DIR || '/var/lib/zalo-crm/files';
  return path.join(root, 'system', 'meta-billing-weekly-state.json');
}

async function readState(): Promise<BillingState> {
  try {
    return JSON.parse(await readFile(statePath(), 'utf8')) as BillingState;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') logger.warn('[meta-billing-weekly] Không đọc được state, dùng state rỗng:', error);
    return { sentWeeks: {} };
  }
}

async function saveState(state: BillingState): Promise<void> {
  const target = statePath();
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
}

async function fetchInvoicePdfs(range: WeekRange, user: string, pass: string): Promise<InvoicePdf[]> {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  const invoices: InvoicePdf[] = [];
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = await client.search({ since: range.start, before: range.end }, { uid: true });
    if (!uids || uids.length === 0) return invoices;
    for await (const message of client.fetch(uids, { uid: true, envelope: true, source: true }, { uid: true })) {
      if (!message.source) continue;
      const parsed = await simpleParser(message.source);
      const from = parsed.from?.text || message.envelope?.from?.map((entry) => entry.address).join(', ') || '';
      const subject = parsed.subject || message.envelope?.subject || '';
      if (!isMetaBillingMessage(from, subject)) continue;
      const receivedAt = parsed.date || message.envelope?.date || range.start;
      const messageId = parsed.messageId || `imap-uid-${message.uid}`;
      const pdfs = parsed.attachments.filter((attachment: Attachment) =>
        attachment.contentType === 'application/pdf'
        || attachment.filename?.toLocaleLowerCase('vi').endsWith('.pdf'));
      pdfs.forEach((attachment: Attachment, index: number) => {
        const content = Buffer.from(attachment.content);
        invoices.push({
          filename: safePdfFilename(attachment.filename || '', index),
          content,
          messageId,
          subject,
          receivedAt,
          sha256: createHash('sha256').update(content).digest('hex'),
        });
      });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
  const unique = new Map<string, InvoicePdf>();
  for (const invoice of invoices) unique.set(invoice.sha256, invoice);
  return [...unique.values()].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
}

function buildHtml(range: WeekRange, invoices: InvoicePdf[], part: number, totalParts: number): string {
  const rows = invoices.map((invoice, index) => `<tr>
    <td style="padding:10px;border-bottom:1px solid #e5e7eb">${index + 1}</td>
    <td style="padding:10px;border-bottom:1px solid #e5e7eb">${invoice.filename}</td>
    <td style="padding:10px;border-bottom:1px solid #e5e7eb">${formatVietnamDate(invoice.receivedAt)}</td>
  </tr>`).join('');
  const partText = totalParts > 1 ? ` (phần ${part}/${totalParts})` : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="620" style="max-width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dfe7f1">
    <tr><td style="padding:24px;background:linear-gradient(135deg,#1769d2,#35a7ff);color:#fff"><h1 style="margin:0;font-size:22px">Hóa đơn quảng cáo Meta${partText}</h1><p style="margin:8px 0 0">Tuần ${range.label}</p></td></tr>
    <tr><td style="padding:22px"><p>Kính gửi bộ phận Kế toán,</p><p>Đính kèm <strong>${invoices.length} file PDF</strong> hóa đơn/biên lai quảng cáo Meta trong kỳ.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px"><thead><tr style="background:#f1f5f9"><th style="padding:10px;text-align:left">#</th><th style="padding:10px;text-align:left">Tệp</th><th style="padding:10px;text-align:left">Ngày nhận</th></tr></thead><tbody>${rows}</tbody></table></td></tr>
    <tr><td style="padding:16px 22px;background:#f8fafc;color:#64748b;font-size:12px;text-align:center">Email tự động từ Nhà Yến CRM · 08:00 thứ Hai hằng tuần</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function runMetaBillingWeekly(options: { now?: Date; dryRun?: boolean } = {}): Promise<WeeklyBillingResult> {
  const range = previousVietnamWeek(options.now);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const recipient = process.env.META_BILLING_RECIPIENT || DEFAULT_RECIPIENT;
  if (!user || !pass) throw new Error('SMTP_USER/SMTP_PASS chưa cấu hình');

  const state = await readState();
  if (!options.dryRun && state.sentWeeks[range.key]) {
    return { skipped: true, reason: 'week_already_sent', week: range, pdfCount: 0, emailCount: 0 };
  }

  const invoices = await fetchInvoicePdfs(range, user, pass);
  if (!invoices.length) {
    logger.warn(`[meta-billing-weekly] Không tìm thấy PDF Meta trong tuần ${range.label}; chưa đánh dấu đã gửi để lần sau có thể thử lại`);
    return { skipped: true, reason: 'no_pdf_found', week: range, pdfCount: 0, emailCount: 0 };
  }
  const groups = splitAttachmentsBySize(invoices);
  if (options.dryRun) {
    return { skipped: false, week: range, pdfCount: invoices.length, emailCount: groups.length };
  }

  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const partText = groups.length > 1 ? ` (${index + 1}/${groups.length})` : '';
    await transport.sendMail({
      from: `"Nhà Yến CRM" <${user}>`,
      to: recipient,
      subject: `[HÓA ĐƠN META] ${range.label}${partText}`,
      html: buildHtml(range, group, index + 1, groups.length),
      attachments: group.map((invoice) => ({ filename: invoice.filename, content: invoice.content, contentType: 'application/pdf' })),
    });
  }

  state.sentWeeks[range.key] = {
    sentAt: new Date().toISOString(),
    pdfHashes: invoices.map((invoice) => invoice.sha256),
    messageCount: groups.length,
  };
  await saveState(state);
  logger.info(`[meta-billing-weekly] Đã gửi ${invoices.length} PDF (${groups.length} email) tuần ${range.label} tới ${recipient}`);
  return { skipped: false, week: range, pdfCount: invoices.length, emailCount: groups.length };
}

let task: ReturnType<typeof cron.schedule> | null = null;
let running = false;

export function startMetaBillingWeekly(): void {
  if (task || process.env.META_BILLING_WEEKLY_ENABLED !== 'true') return;
  const schedule = process.env.META_BILLING_WEEKLY_CRON || DEFAULT_CRON;
  task = cron.schedule(schedule, async () => {
    if (running) return;
    running = true;
    try {
      await runMetaBillingWeekly();
    } catch (error) {
      logger.error('[meta-billing-weekly] Job thất bại:', error);
    } finally {
      running = false;
    }
  }, { timezone: TIME_ZONE });
  logger.info(`[meta-billing-weekly] Đã lên lịch ${schedule} (${TIME_ZONE})`);
}

export function stopMetaBillingWeekly(): void {
  task?.stop();
  task = null;
}
