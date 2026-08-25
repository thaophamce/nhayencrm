// SPDX-License-Identifier: AGPL-3.0-or-later

export const ZALO_ATTACHMENT_SEND_TIMEOUT_MS = 60_000;

export class ZaloAttachmentSendTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Zalo attachment send did not confirm within ${timeoutMs}ms`);
    this.name = 'ZaloAttachmentSendTimeoutError';
  }
}

/**
 * zca-js uses more than one response shape depending on the send method.
 * Keep all extraction in one place so attachment rows receive the real Zalo id.
 */
export function extractZaloMessageId(result: unknown, attachmentIndex = 0): string {
  const value = result as {
    msgId?: number | string;
    data?: { msgId?: number | string };
    message?: { msgId?: number | string } | null;
    attachment?: Array<{ msgId?: number | string }>;
  } | null;
  const hasAttachmentArray = Array.isArray(value?.attachment);
  const raw = hasAttachmentArray
    ? value?.attachment?.[attachmentIndex]?.msgId ?? ''
    : value?.message?.msgId ?? value?.msgId ?? value?.data?.msgId ?? '';
  return raw == null ? '' : String(raw);
}

/**
 * The Zalo server can accept a media send while the SDK promise never settles.
 * A timeout releases the HTTP request; the underlying send is intentionally not
 * retried because delivery may already have happened.
 */
export async function withZaloAttachmentTimeout<T>(
  operation: Promise<T>,
  timeoutMs = ZALO_ATTACHMENT_SEND_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ZaloAttachmentSendTimeoutError(timeoutMs)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function clearPendingConfirmationMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const next = { ...(metadata as Record<string, unknown>) };
  if (next.sendStatus !== 'sending' && next.sendStatus !== 'pending_confirmation') return null;
  delete next.sendStatus;
  delete next.failReason;
  return next;
}

interface PendingMediaClaimStore {
  findFirst(args: unknown): Promise<any | null>;
  findUnique(args: unknown): Promise<any>;
  updateMany(args: unknown): Promise<{ count: number }>;
}

/** Atomically assigns one self-listen echo to one CRM media placeholder. */
export async function claimPendingMediaMessage(
  store: PendingMediaClaimStore,
  input: {
    conversationId: string;
    contentType: string;
    msgId: string;
    msgIdNum: bigint | null;
    cliMsgId?: string;
    albumKey?: string | null;
    albumIndex?: number | null;
    albumTotal?: number | null;
  },
): Promise<any | null> {
  // A batch allows 10 files; 20 CAS attempts absorb a full wave of competing echoes.
  for (let attempt = 0; attempt < 20; attempt++) {
    const existing = await store.findFirst({
      where: { conversationId: input.conversationId, zaloMsgId: input.msgId },
    });
    if (existing) return existing;
    const candidate = await store.findFirst({
      where: {
        conversationId: input.conversationId,
        senderType: 'self',
        contentType: input.contentType,
        zaloMsgId: null,
        // One placeholder is created immediately before its 60s send. Two minutes
        // covers late self-listen without swallowing unrelated native media later.
        sentAt: { gte: new Date(Date.now() - 2 * 60_000) },
        OR: [
          { metadata: { path: ['sendStatus'], equals: 'sending' } },
          { metadata: { path: ['sendStatus'], equals: 'pending_confirmation' } },
        ],
      },
      orderBy: { sentAt: 'asc' },
      select: { id: true },
    });
    if (!candidate) return null;
    let claimed: { count: number };
    try {
      claimed = await store.updateMany({
        where: { id: candidate.id, zaloMsgId: null },
        data: {
          zaloMsgId: input.msgId,
          zaloMsgIdNum: input.msgIdNum,
          ...(input.cliMsgId ? { zaloCliMsgId: input.cliMsgId } : {}),
          ...(input.albumKey ? {
            albumKey: input.albumKey,
            albumIndex: input.albumIndex ?? 0,
            albumTotal: input.albumTotal ?? null,
          } : {}),
        },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      claimed = { count: 0 };
    }
    if (claimed.count > 0) return store.findUnique({ where: { id: candidate.id } });
  }
  return null;
}
