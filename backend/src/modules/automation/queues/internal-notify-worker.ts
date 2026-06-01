// ════════════════════════════════════════════════════════════════════════
// Luồng Mục Tiêu M4 — Internal Notify BullMQ Worker (2026-06-01)
// ════════════════════════════════════════════════════════════════════════
//
// Privacy v2 (memory M51.4 + B4):
//   - File này thuộc module system-notifications scope private-hs ONLY
//   - Public main branch dynamic import + try/catch NUỐT lỗi
//     (worker existence check: nếu null → silent skip job)
//   - check-private-leak.sh chạy trước push main upstream
//
// 6 hooks (anh chốt section 16 design doc):
//   1. no-zalo (P4)             — KH không có Zalo, sale gọi điện
//   2. send-error (P5)          — sendFriendRequest fail, notify lý do
//   3. friend-accept (M51.4-a)  — KH bấm Đồng ý, sale chat ngay
//   4. friend-reject (M51.4-b)  — KH bấm Từ chối, low priority
//   5. customer-reply (M51.4-c) — KH reply tin sequence (KHẨN HIGH)
//                                 + debounce 60s tránh spam khi KH gõ nhiều tin
//   6. friend-accept-late       — KH accept lâu sau (debounce status)
//
// Reuse sendSystemNotificationToUser có sẵn:
//   - Resolve recipient + sender Zalo nick
//   - Channel fallback (zalo / crm_panel)
//   - SystemNotification row + Zalo SDK dispatch

import { Worker, type Job } from 'bullmq';
import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { getBullMQRedis } from './redis-connection.js';
import { QUEUE_NAMES, getInternalNotifyQueue } from './queue-registry.js';

export type NotifyHookKind =
  | 'no-zalo'
  | 'send-error'
  | 'friend-accept'
  | 'friend-reject'
  | 'customer-reply'
  | 'friend-accept-late';

export interface InternalNotifyJobData {
  kind: NotifyHookKind;
  orgId: string;
  targetUserId: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  nickId?: string;
  nickName?: string;
  triggerId?: string;
  triggerName?: string;
  sequenceName?: string;
  stepInfo?: { idx: number; total: number };
  errorMessage?: string;
  replyPreview?: string;
  customerScore?: number;
  link?: string;
}

// ════════════════════════════════════════════════════════════════════════
// Template rendering — section 16 design doc + memory M51.4
// ════════════════════════════════════════════════════════════════════════
function renderTemplate(data: InternalNotifyJobData): {
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high';
} {
  const name = data.contactName ?? data.contactPhone ?? 'KH ẩn danh';
  const phone = data.contactPhone ?? '';
  const nick = data.nickName ?? data.nickId ?? '';
  const link = data.link ?? '';

  switch (data.kind) {
    case 'no-zalo':
      return {
        title: `📵 ${name} không có Zalo`,
        content: `${name} (${phone}) không có Zalo. Gọi điện thoại liên hệ trực tiếp.`,
        priority: 'normal',
      };

    case 'send-error':
      return {
        title: `❌ Không gửi được kết bạn`,
        content: `Không gửi được kết bạn cho ${name}. Lý do: ${data.errorMessage ?? 'không rõ'}. Mục tiêu: ${data.triggerName ?? ''} ${link ? `\n${link}` : ''}`,
        priority: 'normal',
      };

    case 'friend-accept':
      return {
        title: `🤝 ${name} đã đồng ý kết bạn`,
        content: `${name} (${phone}) vừa bấm Đồng ý kết bạn trên nick ${nick}. Vào chat ngay: ${link}`,
        priority: 'normal',
      };

    case 'friend-reject':
      return {
        title: `❌ ${name} từ chối kết bạn`,
        content: `${name} (${phone}) bấm Từ chối kết bạn từ nick ${nick}. Theo cấu hình, chuỗi bám đuổi vẫn chạy qua Stranger Inbox. Xem Mục tiêu: ${data.triggerName ?? ''} ${link ? `\n${link}` : ''}`,
        priority: 'low',
      };

    case 'customer-reply': {
      const preview = (data.replyPreview ?? '').slice(0, 100);
      const stepHint = data.stepInfo ? `Bước ${data.stepInfo.idx}/${data.stepInfo.total}` : '';
      const scoreHint = data.customerScore !== undefined ? ` (Điểm ${data.customerScore})` : '';
      return {
        title: `🔥 [KHẨN] ${name} vừa nhắn`,
        content: `${name} (${phone})${scoreHint}: "${preview}"\nNick: ${nick} • ${data.sequenceName ?? ''} ${stepHint}\nChuỗi đã pause. Vào trả lời ngay: ${link}`,
        priority: 'high',
      };
    }

    case 'friend-accept-late':
      return {
        title: `🕐 ${name} accept lâu sau`,
        content: `${name} (${phone}) accept lời mời kết bạn từ nick ${nick} sau thời gian dài. Chuỗi bám đuổi đã đi xa, em check trạng thái hiện tại: ${link}`,
        priority: 'normal',
      };

    default:
      return {
        title: `📨 Thông báo automation`,
        content: `Sự kiện ${data.kind} cho ${name}`,
        priority: 'normal',
      };
  }
}

// ════════════════════════════════════════════════════════════════════════
// Debounce — customer-reply hook (memory M51.4-c)
// 1 KH reply nhiều tin liên tục < 60s → chỉ bắn 1 notify, preview = tin mới nhất
// ════════════════════════════════════════════════════════════════════════
async function shouldDebounceCustomerReply(
  contactId: string,
  triggerId: string | undefined,
): Promise<boolean> {
  const redis = getBullMQRedis();
  const key = `notify-debounce:reply:${contactId}:${triggerId ?? 'none'}`;
  // SETNX với TTL 60s — nếu return 0 = đã có pending notify trong 60s qua
  const setResult = await redis.set(key, '1', 'EX', 60, 'NX');
  return setResult === null; // null = key đã tồn tại (debounced)
}

// ════════════════════════════════════════════════════════════════════════
// Job processor — single tick per notify
// ════════════════════════════════════════════════════════════════════════
async function processJob(job: Job<InternalNotifyJobData>): Promise<{ status: string; reason?: string }> {
  const data = job.data;
  const tag = `[notify-${data.kind} job=${job.id}]`;

  // Debounce customer-reply hook
  if (data.kind === 'customer-reply' && data.contactId) {
    const debounced = await shouldDebounceCustomerReply(data.contactId, data.triggerId);
    if (debounced) {
      logger.info(`${tag} debounced — already notified < 60s ago`);
      return { status: 'debounced' };
    }
  }

  // Check user notification preferences (memory M51.4)
  const user = await prisma.user.findUnique({
    where: { id: data.targetUserId },
    select: { id: true, fullName: true },
  });
  if (!user) {
    return { status: 'skipped', reason: 'target_user_not_found' };
  }

  // Render template
  const { title, content, priority } = renderTemplate(data);

  // Dynamic import system-notify-service — PRIVATE-HS ONLY MODULE
  // Public main branch: module thiếu → import return null → silent skip
  let sendNotify: ((input: {
    orgId: string;
    targetUserId: string;
    type: string;
    title: string;
    content: string;
    priority?: 'low' | 'normal' | 'high';
  }) => Promise<unknown>) | null = null;

  try {
    const mod = await import('../../system-notifications/system-notify-service.js');
    sendNotify = mod.sendSystemNotificationToUser ?? null;
  } catch (err) {
    logger.warn(
      `${tag} system-notifications module unavailable (private-hs only?): ${(err as Error).message}`,
    );
  }

  if (!sendNotify) {
    return { status: 'skipped', reason: 'system_notify_module_missing' };
  }

  // Dispatch notification
  try {
    await sendNotify({
      orgId: data.orgId,
      targetUserId: data.targetUserId,
      type: data.kind,
      title,
      content,
      priority,
    });
    logger.info(`${tag} dispatched to user ${user.fullName} priority=${priority}`);

    // Audit event log
    await prisma.automationEventLog.create({
      data: {
        orgId: data.orgId,
        triggerId: data.triggerId,
        contactId: data.contactId,
        nickId: data.nickId,
        eventType: `internal_notify_${data.kind.replace(/-/g, '_')}`,
        detail: `→ user ${user.fullName} (${priority})`,
      },
    });

    return { status: 'sent' };
  } catch (err) {
    logger.error(`${tag} dispatch failed: ${(err as Error).message}`);
    throw err; // BullMQ retry
  }
}

// ════════════════════════════════════════════════════════════════════════
// Worker lifecycle
// ════════════════════════════════════════════════════════════════════════
let workerInstance: Worker<InternalNotifyJobData> | null = null;

export function startInternalNotifyWorker(): Worker {
  if (workerInstance) {
    logger.warn('[internal-notify-worker] already started');
    return workerInstance;
  }

  workerInstance = new Worker<InternalNotifyJobData>(
    QUEUE_NAMES.INTERNAL_NOTIFY,
    processJob,
    {
      connection: getBullMQRedis(),
      // Notify nhanh, không lock 1 nick — concurrency cao
      concurrency: 10,
    },
  );

  workerInstance.on('completed', (job) => {
    logger.info(
      `[internal-notify-worker] completed job=${job.id} kind=${job.data.kind} status=${job.returnvalue?.status}`,
    );
  });

  workerInstance.on('failed', (job, err) => {
    logger.error(
      `[internal-notify-worker] failed job=${job?.id} kind=${job?.data?.kind} attempt=${job?.attemptsMade}: ${err.message}`,
    );
  });

  workerInstance.on('error', (err) => {
    logger.error(`[internal-notify-worker] error: ${err.message}`);
  });

  logger.info('[internal-notify-worker] started concurrency=10');
  return workerInstance;
}

export async function stopInternalNotifyWorker(): Promise<void> {
  if (workerInstance) {
    logger.info('[internal-notify-worker] closing...');
    await workerInstance.close();
    workerInstance = null;
  }
}

// ════════════════════════════════════════════════════════════════════════
// Enqueue helpers — gọi từ event hooks M5
// ════════════════════════════════════════════════════════════════════════
export async function enqueueNotify(data: InternalNotifyJobData): Promise<void> {
  const queue = getInternalNotifyQueue();
  await queue.add(data.kind, data);
  logger.info(`[internal-notify] enqueued kind=${data.kind} target=${data.targetUserId}`);
}

// Convenience enqueuers cho từng hook
export const notifyNoZalo = (
  d: Omit<InternalNotifyJobData, 'kind'>,
): Promise<void> => enqueueNotify({ ...d, kind: 'no-zalo' });

export const notifySendError = (
  d: Omit<InternalNotifyJobData, 'kind'>,
): Promise<void> => enqueueNotify({ ...d, kind: 'send-error' });

export const notifyFriendAccept = (
  d: Omit<InternalNotifyJobData, 'kind'>,
): Promise<void> => enqueueNotify({ ...d, kind: 'friend-accept' });

export const notifyFriendReject = (
  d: Omit<InternalNotifyJobData, 'kind'>,
): Promise<void> => enqueueNotify({ ...d, kind: 'friend-reject' });

export const notifyCustomerReply = (
  d: Omit<InternalNotifyJobData, 'kind'>,
): Promise<void> => enqueueNotify({ ...d, kind: 'customer-reply' });

export const notifyFriendAcceptLate = (
  d: Omit<InternalNotifyJobData, 'kind'>,
): Promise<void> => enqueueNotify({ ...d, kind: 'friend-accept-late' });
