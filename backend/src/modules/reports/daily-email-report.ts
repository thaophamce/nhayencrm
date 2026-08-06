// SPDX-License-Identifier: AGPL-3.0-or-later
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_RECIPIENT = 'thaophamce@gmail.com';
const PER_FILE = 20_000;
const APPROVED_BONUS = 10_000;
const DESIGN_FEE = 100_000;

export interface DailyReport {
  orgName: string;
  reportDate: string;
  delivery: {
    revenue: number;
    outstanding: number;
    totalOrders: number;
    byMethod: Record<string, number>;
  };
  design: { newDemo: number; approved: number; salary: number };
  messages: {
    newCustomers: number;
    inboundMessages: number;
    byAccount: Array<{ name: string; newCustomers: number; inboundMessages: number }>;
  };
}

const REPORT_ACCOUNT_NAMES = ['Thiệp Cưới', 'Thiệp Cưới Nhà Yến'] as const;

const METHOD_LABELS: Record<string, string> = {
  viettelpost: 'ViettelPost',
  coach: 'Ship chành',
  ship_chanh: 'Ship chành',
  grab: 'Grab',
  pickup: 'Nhận tại xưởng',
  factory_pickup: 'Nhận tại xưởng',
};

export function previousVietnamDay(now = new Date()): { start: Date; end: Date; label: string } {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [year, month, day] = local.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, day) - 7 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const label = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(start);
  return { start, end, label };
}

export async function collectDailyReport(
  org: { id: string; name: string },
  range = previousVietnamDay(),
): Promise<DailyReport> {
  const dateWhere = { gte: range.start, lt: range.end };
  const [deliveryOrders, newDemo, histories, accounts] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: { orgId: org.id, deletedAt: null, createdDate: dateWhere },
      select: { totalAmount: true, deposit: true, paymentStatus: true, deliveryMethod: true },
    }),
    prisma.order.count({ where: { orgId: org.id, status: 'demo', createdAt: dateWhere } }),
    prisma.orderStatusHistory.findMany({
      where: { changedAt: dateWhere, order: { orgId: org.id }, status: { in: ['designing', 'approved'] } },
      select: { status: true, order: { select: { fileCount: true, hasDesignFee: true } } },
    }),
    prisma.zaloAccount.findMany({
      where: { orgId: org.id, archivedAt: null, displayName: { in: [...REPORT_ACCOUNT_NAMES] } },
      select: { id: true, displayName: true },
    }),
  ]);

  const accountMap = new Map(accounts.map((account) => [account.displayName, account]));
  const byAccount = await Promise.all(REPORT_ACCOUNT_NAMES.map(async (name) => {
    const account = accountMap.get(name);
    if (!account) return { name, newCustomers: 0, inboundMessages: 0 };
    const [newCustomerRows, inboundMessages] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          orgId: org.id, zaloAccountId: account.id, threadType: 'user', contactId: { not: null },
          contact: { mergedInto: null, createdAt: dateWhere },
        },
        select: { contactId: true }, distinct: ['contactId'],
      }),
      prisma.message.count({
        where: {
          senderType: 'contact', isDeleted: false, sentAt: dateWhere,
          conversation: { orgId: org.id, zaloAccountId: account.id, threadType: 'user' },
        },
      }),
    ]);
    return { name, newCustomers: newCustomerRows.length, inboundMessages };
  }));

  const delivery = deliveryOrders.reduce<DailyReport['delivery']>((result, order) => {
    const total = Number(order.totalAmount);
    const deposit = Number(order.deposit);
    result.totalOrders += 1;
    result.revenue += total;
    result.outstanding += order.paymentStatus === 'paid' ? 0 : Math.max(0, total - deposit);
    result.byMethod[order.deliveryMethod] = (result.byMethod[order.deliveryMethod] || 0) + 1;
    return result;
  }, { revenue: 0, outstanding: 0, totalOrders: 0, byMethod: {} });

  let approved = 0;
  let salary = 0;
  for (const history of histories) {
    if (history.status === 'approved') {
      approved += 1;
      salary += APPROVED_BONUS;
    } else {
      salary += history.order.fileCount * PER_FILE;
      if (history.order.hasDesignFee) salary += DESIGN_FEE;
    }
  }

  return {
    orgName: org.name,
    reportDate: range.label,
    delivery,
    design: { newDemo, approved, salary },
    messages: {
      newCustomers: byAccount.reduce((sum, item) => sum + item.newCustomers, 0),
      inboundMessages: byAccount.reduce((sum, item) => sum + item.inboundMessages, 0),
      byAccount,
    },
  };
}

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function metric(label: string, value: string, color = '#2563eb'): string {
  return `<td style="width:33%;padding:8px"><div style="padding:15px 8px;border:1px solid #dbe3ef;border-radius:8px;text-align:center;background:#f8fafc"><div style="font-size:11px;color:#64748b;text-transform:uppercase">${label}</div><div style="margin-top:8px;font-size:18px;font-weight:700;color:${color}">${value}</div></div></td>`;
}

export function buildDailyReportEmail(report: DailyReport): { subject: string; html: string } {
  const methodRows = Object.entries(report.delivery.byMethod)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `<tr><td style="padding:9px;border:1px solid #dbe3ef">${escapeHtml(METHOD_LABELS[key] || key)}</td><td style="padding:9px;border:1px solid #dbe3ef;text-align:right">${count} đơn</td></tr>`)
    .join('') || '<tr><td colspan="2" style="padding:10px;border:1px solid #dbe3ef;text-align:center;color:#64748b">Không có đơn</td></tr>';
  const accountRows = report.messages.byAccount.map((account) => `<tr>
    <td class="account-name" style="padding:14px 16px;border-bottom:1px solid #e8eef5;font-weight:700;color:#17233c">${escapeHtml(account.name)}</td>
    <td style="padding:14px 8px;border-bottom:1px solid #e8eef5;text-align:center"><strong style="font-size:18px;color:#14946b">${account.newCustomers}</strong><span class="mobile-label" style="display:none"> khách mới</span></td>
    <td style="padding:14px 16px 14px 8px;border-bottom:1px solid #e8eef5;text-align:center"><strong style="font-size:18px;color:#2767d8">${account.inboundMessages}</strong><span class="mobile-label" style="display:none"> tin nhắn</span></td>
  </tr>`).join('');
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @media only screen and (max-width:480px){.shell{width:100%!important}.pad{padding:20px 16px!important}.metric{display:block!important;width:100%!important;padding:0 0 8px!important}.account-head{display:none!important}.account-name{display:block!important;padding-bottom:4px!important;border-bottom:0!important}.account-table td:not(.account-name){display:inline-block!important;width:42%!important;text-align:left!important;padding:4px 0 14px 16px!important}.mobile-label{display:inline!important}.title{font-size:24px!important}.section{font-size:17px!important}}
  </style></head><body style="margin:0;padding:0;background:#f3f6fa;color:#17233c;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa"><tr><td align="center" style="padding:20px 8px">
  <table role="presentation" class="shell" width="680" cellspacing="0" cellpadding="0" style="width:680px;max-width:100%;background:#ffffff;border:1px solid #dfe7f0;border-radius:12px;overflow:hidden">
    <tr><td class="pad" style="padding:28px 32px;background:#12213d;border-bottom:4px solid #1b9aaa">
      <div style="font-size:12px;line-height:1.4;letter-spacing:1.5px;text-transform:uppercase;color:#74d1d8;font-weight:700">Nhà Yến CRM · Daily Brief</div>
      <h1 class="title" style="margin:8px 0 6px;font-size:29px;line-height:1.25;color:#ffffff">Báo cáo vận hành hằng ngày</h1>
      <div style="font-size:14px;line-height:1.6;color:#c8d6e8">${escapeHtml(report.orgName)} &nbsp;·&nbsp; ${report.reportDate}</div>
    </td></tr>
    <tr><td class="pad" style="padding:28px 32px">
      <h2 class="section" style="margin:0 0 14px;font-size:19px;color:#17233c">01&nbsp; Giao vận</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td class="metric" style="width:33.33%;padding-right:6px"><div style="padding:15px 12px;background:#f4fbf8;border:1px solid #d8eee5;border-radius:8px"><div style="font-size:11px;color:#607083;text-transform:uppercase">Doanh thu</div><div style="margin-top:7px;font-size:18px;font-weight:700;color:#14805e">${money(report.delivery.revenue)}</div></div></td>
        <td class="metric" style="width:33.33%;padding:0 3px"><div style="padding:15px 12px;background:#fff7f6;border:1px solid #f3dedb;border-radius:8px"><div style="font-size:11px;color:#607083;text-transform:uppercase">Chưa thanh toán</div><div style="margin-top:7px;font-size:18px;font-weight:700;color:#c6473d">${money(report.delivery.outstanding)}</div></div></td>
        <td class="metric" style="width:33.33%;padding-left:6px"><div style="padding:15px 12px;background:#f3f7fd;border:1px solid #dce6f5;border-radius:8px"><div style="font-size:11px;color:#607083;text-transform:uppercase">Tổng đơn</div><div style="margin-top:7px;font-size:18px;font-weight:700;color:#2767d8">${report.delivery.totalOrders} đơn</div></div></td>
      </tr></table>
      <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;border:1px solid #dfe7f0;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden"><tr style="background:#edf3f8"><th style="padding:10px 14px;text-align:left;font-size:12px;color:#52657a">HÌNH THỨC VẬN CHUYỂN</th><th style="padding:10px 14px;text-align:right;font-size:12px;color:#52657a">SỐ ĐƠN</th></tr>${methodRows}</table>

      <h2 class="section" style="margin:28px 0 14px;font-size:19px;color:#17233c">02&nbsp; Đơn thiết kế</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td class="metric" style="width:33.33%;padding-right:6px"><div style="padding:15px 12px;background:#fff8ef;border:1px solid #f5e4ca;border-radius:8px"><div style="font-size:11px;color:#607083;text-transform:uppercase">Demo mới</div><div style="margin-top:7px;font-size:20px;font-weight:700;color:#d97706">${report.design.newDemo}</div></div></td>
        <td class="metric" style="width:33.33%;padding:0 3px"><div style="padding:15px 12px;background:#f4fbf8;border:1px solid #d8eee5;border-radius:8px"><div style="font-size:11px;color:#607083;text-transform:uppercase">Chốt in</div><div style="margin-top:7px;font-size:20px;font-weight:700;color:#14946b">${report.design.approved}</div></div></td>
        <td class="metric" style="width:33.33%;padding-left:6px"><div style="padding:15px 12px;background:#f3f7fd;border:1px solid #dce6f5;border-radius:8px"><div style="font-size:11px;color:#607083;text-transform:uppercase">Tổng lương</div><div style="margin-top:7px;font-size:18px;font-weight:700;color:#234f9d">${money(report.design.salary)}</div></div></td>
      </tr></table>

      <h2 class="section" style="margin:28px 0 6px;font-size:19px;color:#17233c">03&nbsp; Tin nhắn khách hàng</h2>
      <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#68798c">Chi tiết hai nick Zalo chính trong ngày</p>
      <table class="account-table" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dfe7f0;border-radius:8px;border-collapse:separate;border-spacing:0;overflow:hidden">
        <tr class="account-head" style="background:#edf3f8"><th style="padding:10px 16px;text-align:left;font-size:12px;color:#52657a">NICK ZALO</th><th style="padding:10px 8px;text-align:center;font-size:12px;color:#52657a">KHÁCH MỚI</th><th style="padding:10px 16px 10px 8px;text-align:center;font-size:12px;color:#52657a">TIN TỪ KHÁCH</th></tr>${accountRows}
        <tr style="background:#f8fafc"><td class="account-name" style="padding:13px 16px;font-weight:700;color:#17233c">Tổng cộng</td><td style="padding:13px 8px;text-align:center;font-weight:700;color:#14946b">${report.messages.newCustomers}<span class="mobile-label" style="display:none"> khách mới</span></td><td style="padding:13px 16px 13px 8px;text-align:center;font-weight:700;color:#2767d8">${report.messages.inboundMessages}<span class="mobile-label" style="display:none"> tin nhắn</span></td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:18px 24px;background:#f8fafc;border-top:1px solid #e8eef5;text-align:center;font-size:12px;line-height:1.6;color:#8190a3">Báo cáo tự động lúc 08:00 mỗi ngày<br><strong style="color:#52657a">Nhà Yến CRM</strong></td></tr>
  </table></td></tr></table></body></html>`;
  return { subject: `[BÁO CÁO HẰNG NGÀY] ${report.reportDate} - ${report.orgName}`, html };
}

let task: ReturnType<typeof cron.schedule> | null = null;
let running = false;

export async function sendDailyReports(): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    logger.warn('[daily-email-report] SMTP_USER/SMTP_PASS chưa cấu hình; bỏ qua gửi báo cáo');
    return;
  }
  const recipient = process.env.DAILY_REPORT_EMAIL || DEFAULT_RECIPIENT;
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  const range = previousVietnamDay();
  for (const org of orgs) {
    try {
      const message = buildDailyReportEmail(await collectDailyReport(org, range));
      await transport.sendMail({ from: `"Nhà Yến CRM" <${user}>`, to: recipient, ...message });
      logger.info(`[daily-email-report] Đã gửi báo cáo ${range.label} cho org=${org.id} tới ${recipient}`);
    } catch (error) {
      logger.error(`[daily-email-report] Gửi báo cáo thất bại cho org=${org.id}:`, error);
    }
  }
}

export function startDailyEmailReport(): void {
  if (task) return;
  task = cron.schedule('0 8 * * *', async () => {
    if (running) return;
    running = true;
    try { await sendDailyReports(); } finally { running = false; }
  }, { timezone: TIME_ZONE });
  logger.info('[daily-email-report] Đã lên lịch 08:00 hằng ngày (Asia/Ho_Chi_Minh)');
}

export function stopDailyEmailReport(): void {
  task?.stop();
  task = null;
}
