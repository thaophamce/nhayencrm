// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * chat-attachment-routes.ts — Upload chat attachments (image/video) and send via Zalo.
 * Accepts multipart form with 1+ files + optional caption.
 * Flow: validate → save to tmp → upload to MinIO → call zca-js sendImage/sendVideo with local path → persist Message rows.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'socket.io';
import { emitChatMessage } from '../../shared/realtime/emit-chat.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { generateThumbnail, sendNativeVideo } from '../../shared/video-processor.js';
import { uploadBuffer, type UploadResult } from '../../shared/storage/minio-client.js';
import { compressImage } from '../media/media-service.js';
import { logger } from '../../shared/utils/logger.js';
// Fix 2026-06-03 — M11 optimistic badge cache (Anh báo "Sale CRM · Staff")
// 2026-06-11 — createMediaMessage gộp 4 block message.create lặp (DRY, eng review E4).
import { getUserFullName, createMediaMessage } from './chat-helpers.js';
import {
  extractZaloMessageId,
  withZaloAttachmentTimeout,
  ZaloAttachmentSendTimeoutError,
} from './chat-send-utils.js';

export const IMAGE_MAX = 100 * 1024 * 1024;
export const VIDEO_MAX = 500 * 1024 * 1024;
export const FILE_MAX = 1024 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 10;
export const ATTACHMENT_TOTAL_MAX = 500 * 1024 * 1024;
export const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ALLOWED_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
export const ALLOWED_FILE = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/zip', 'application/x-zip-compressed',
  'application/gzip', 'application/x-gzip',
  'application/x-rar-compressed', 'application/vnd.rar',
  'application/x-tar', 'application/x-gtar',
];

function isAllowed(mime: string): boolean {
  return ALLOWED_IMAGE.includes(mime) || ALLOWED_VIDEO.includes(mime) || ALLOWED_FILE.includes(mime);
}

interface ParsedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  kind: 'image' | 'video' | 'file';
  size: number;
}

function classify(mime: string): 'image' | 'video' | 'file' {
  if (ALLOWED_IMAGE.includes(mime)) return 'image';
  if (ALLOWED_VIDEO.includes(mime)) return 'video';
  return 'file';
}

export async function chatAttachmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.post(
    '/api/v1/conversations/:id/attachments',
    { preHandler: requireZaloAccess('chat') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId: user.orgId },
        include: { zaloAccount: true },
      });
      if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

      // T7b (YC2 2026-06-20): chặn gửi file/ảnh qua nick ĐÃ XÓA (archivedAt).
      if (conversation.zaloAccount.archivedAt) {
        return reply.status(409).send({ error: 'Nick này đã bị xóa — chỉ xem lại lịch sử, không gửi được.', code: 'NICK_ARCHIVED' });
      }

      // Fix 2026-06-03 — optimistic badge "Sale CRM · {tên}"
      const userFullName = await getUserFullName(user.id);

      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

      // PRIVACY GUARD 2026-05-22: nick privacy=main → chỉ chính chủ upload được
      if (conversation.zaloAccount.privacyMode === 'main') {
        const senderUserId = (user as any).userId ?? user.id;
        if (conversation.zaloAccount.ownerUserId !== senderUserId) {
          return reply.status(403).send({
            error: 'Nick này đang bật Riêng tư — chỉ chính chủ mới gửi được file/ảnh.',
            code: 'PRIVACY_LOCKED',
          });
        }
      }

      const limits = await zaloRateLimiter.checkLimits(conversation.zaloAccountId);
      if (!limits.allowed) return reply.status(429).send({ error: limits.reason });

      // Parse multipart parts
      let caption = '';
      const files: ParsedFile[] = [];
      let totalBytes = 0;
      try {
        for await (const part of request.parts()) {
          if (part.type === 'field' && part.fieldname === 'caption') {
            caption = String(part.value ?? '');
          } else if (part.type === 'file') {
            if (files.length >= ATTACHMENT_MAX_FILES) {
              return reply.status(413).send({ error: `Maximum ${ATTACHMENT_MAX_FILES} files per upload` });
            }
            if (!isAllowed(part.mimetype)) {
              return reply.status(415).send({ error: `Unsupported file type: ${part.mimetype}` });
            }
            const kind = classify(part.mimetype);
            const buf = await part.toBuffer();
            const max = kind === 'image' ? IMAGE_MAX : kind === 'video' ? VIDEO_MAX : FILE_MAX;
            if (buf.length > max) {
              return reply.status(413).send({ error: `${kind} exceeds ${max / 1024 / 1024}MB` });
            }
            totalBytes += buf.length;
            if (totalBytes > ATTACHMENT_TOTAL_MAX) {
              return reply.status(413).send({ error: 'Total attachment size exceeds 500MB' });
            }
            files.push({ buffer: buf, filename: part.filename, mimeType: part.mimetype, kind, size: buf.length });
          }
        }
      } catch (err: any) {
        return reply.status(400).send({ error: `multipart parse error: ${err?.message ?? err}` });
      }

      if (files.length === 0) return reply.status(400).send({ error: 'No files uploaded' });

      const threadId = conversation.externalThreadId || '';
      const threadType = conversation.threadType === 'group' ? 1 : 0;
      const io = (app as any).io as Server;
      const attachmentRequestStartedAt = Date.now();

      // Write each file to tmp + upload to MinIO in parallel
      const tmpRoot = path.join(tmpdir(), 'zalocrm-upload', randomUUID());
      await mkdir(tmpRoot, { recursive: true });
      const tmpPaths: string[] = [];
      const mirrors: UploadResult[] = [];
      let deferTmpCleanup = false;
      const localReady: Array<Promise<void>> = [];
      const resolveLocalReady: Array<() => void> = [];
      for (let i = 0; i < files.length; i++) {
        localReady[i] = new Promise<void>((resolve) => { resolveLocalReady[i] = resolve; });
      }
      try {
        const mirrorStartedAt = Date.now();
        const mirrorPromise = Promise.all(files.map(async (f, i) => {
          const tmpPath = path.join(tmpRoot, `${i}-${f.filename || 'upload'}`);
          await writeFile(tmpPath, f.buffer);
          tmpPaths[i] = tmpPath;
          resolveLocalReady[i]();
          const proc = f.kind === 'image'
            ? await compressImage(f.buffer, f.mimeType)
            : { buffer: f.buffer, mimeType: f.mimeType };
          mirrors[i] = await uploadBuffer(proc.buffer, proc.mimeType, f.filename);
        })).then(() => {
          logger.info(`[chat-attachment][perf] stage=mirror files=${files.length} bytes=${files.reduce((sum, file) => sum + file.size, 0)} mirrorMs=${Date.now() - mirrorStartedAt}`);
        });

        // Zalo upload starts as soon as local files exist; CRM mirror continues in parallel.
        await Promise.all(localReady);

        const created: any[] = [];
        let hasUnconfirmedSend = false;
        let hasFailedSend = false;

        const emitPersisted = async (message: any) => emitChatMessage({
          io,
          orgId: user.orgId,
          accountId: conversation.zaloAccountId,
          conversationId: id,
          message,
          privacyMode: conversation.zaloAccount.privacyMode,
          ownerUserId: conversation.zaloAccount.ownerUserId,
        });

        const senderMetadata = (sendStatus?: string, failReason?: string) => ({
          sender: { kind: 'user_crm', name: userFullName },
          ...(sendStatus ? { sendStatus } : {}),
          ...(failReason ? { failReason } : {}),
        });

        const createPendingMessage = async (input: {
          contentType: 'image' | 'video' | 'file';
          content: string;
        }) => {
          const message = await createMediaMessage({
            conversationId: id,
            zaloAccount: conversation.zaloAccount,
            repliedByUserId: user.id,
            zaloMsgId: '',
            contentType: input.contentType,
            content: input.content,
            metadata: senderMetadata('sending'),
            sentVia: 'user',
          });
          created.push(message);
          await emitPersisted(message);
          return message;
        };

        const replaceCreated = (message: any) => {
          const index = created.findIndex((item) => item.id === message.id);
          if (index >= 0) created[index] = message;
        };

        const updatePendingMessage = async (
          message: any,
          options: { sendResult?: unknown; attachmentIndex?: number; sendStatus?: string; failReason?: string },
        ) => {
          const zaloMsgId = options.sendResult
            ? extractZaloMessageId(options.sendResult, options.attachmentIndex ?? 0)
            : '';
          const resolvedSendStatus = options.sendResult && !zaloMsgId
            ? 'pending_confirmation'
            : options.sendStatus;
          if (resolvedSendStatus === 'pending_confirmation') hasUnconfirmedSend = true;
          if (options.sendResult && zaloMsgId) {
            await prisma.message.updateMany({
              where: { id: message.id, zaloMsgId: null },
              data: {
                zaloMsgId,
                zaloMsgIdNum: /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null,
                metadata: senderMetadata(resolvedSendStatus, options.failReason),
              },
            });
          } else {
            await prisma.message.updateMany({
              where: { id: message.id, zaloMsgId: null },
              data: { metadata: senderMetadata(resolvedSendStatus, options.failReason) },
            });
          }
          const updated = await prisma.message.findUnique({ where: { id: message.id } }) ?? message;
          replaceCreated(updated);
          await emitPersisted(updated);
          return updated;
        };

        const keepPendingConfirmation = async (messages: any[], label: string) => {
          // Promise.race cannot cancel zca-js. Keep source files briefly because the
          // SDK may still be uploading even after CRM has released the HTTP request.
          deferTmpCleanup = true;
          const pendingResults = await Promise.all(messages.map(async (message) => {
            const result = await prisma.message.updateMany({
              where: { id: message.id, zaloMsgId: null },
              data: { metadata: senderMetadata('pending_confirmation') },
            });
            const current = await prisma.message.findUnique({ where: { id: message.id } });
            if (current) {
              replaceCreated(current);
              if (result.count > 0) await emitPersisted(current);
            }
            return result.count > 0;
          }));
          const pendingCount = pendingResults.filter(Boolean).length;
          if (pendingCount > 0) {
            hasUnconfirmedSend = true;
            logger.warn(`[chat-attachment] ${label} reached Zalo timeout; keeping ${pendingCount} local message(s) pending confirmation`);
          } else {
            logger.info(`[chat-attachment] ${label} timed out after self-listen had already confirmed every local message`);
          }
        };

        const markFailed = async (messages: any[], err: unknown) => {
          const reason = err instanceof Error ? err.message : String(err || 'attachment send failed');
          const results = await Promise.all(messages.map(async (message) => {
            const result = await prisma.message.updateMany({
              where: { id: message.id, zaloMsgId: null },
              data: { metadata: senderMetadata('failed', reason) },
            });
            const current = await prisma.message.findUnique({ where: { id: message.id } });
            if (current) {
              replaceCreated(current);
              if (result.count > 0) await emitPersisted(current);
            }
            return result.count > 0;
          }));
          const failedCount = results.filter(Boolean).length;
          if (failedCount > 0) hasFailedSend = true;
          return failedCount;
        };

        const reconcileConfirmed = async (
          message: any,
          sendResult: unknown,
          attachmentIndex = 0,
        ) => {
          try {
            await updatePendingMessage(message, { sendResult, attachmentIndex });
          } catch (err) {
            logger.error('[chat-attachment] Zalo confirmed media but CRM update failed; keeping row pending for self-listen:', err);
            hasUnconfirmedSend = true;
            await prisma.message.updateMany({
              where: { id: message.id, zaloMsgId: null },
              data: { metadata: senderMetadata('pending_confirmation') },
            }).catch(() => {});
          }
        };

        // Split by kind — image batch vs video one-by-one vs file one-by-one
        const imageIndexes: number[] = [];
        const videoIndexes: number[] = [];
        const fileIndexes: number[] = [];
        files.forEach((f, i) => {
          if (f.kind === 'image') imageIndexes.push(i);
          else if (f.kind === 'video') videoIndexes.push(i);
          else fileIndexes.push(i);
        });

        // Send images as one zca-js call (supports multiple paths at once)
        if (imageIndexes.length > 0) {
          await mirrorPromise;
          const pendingImages: any[] = [];
          for (const i of imageIndexes) {
            const mirror = mirrors[i];
            pendingImages.push(await createPendingMessage({
              contentType: 'image',
              content: JSON.stringify({ href: mirror.url, thumb: mirror.url, size: mirror.size }),
            }));
          }
          try {
            zaloRateLimiter.recordSend(conversation.zaloAccountId);
            const paths = imageIndexes.map((i) => tmpPaths[i]);
            const sendResult = await withZaloAttachmentTimeout(instance.api.sendMessage(
              { msg: caption, attachments: paths },
              threadId,
              threadType,
            ));
            for (let index = 0; index < pendingImages.length; index++) {
              await reconcileConfirmed(pendingImages[index], sendResult, index);
            }
          } catch (err) {
            if (err instanceof ZaloAttachmentSendTimeoutError) {
              await keepPendingConfirmation(pendingImages, 'image send');
            } else {
              await markFailed(pendingImages, err);
            }
          }
        }

        // Send videos one-by-one using native sendVideo
        for (const i of videoIndexes) {
          zaloRateLimiter.recordSend(conversation.zaloAccountId);
          let generatedThumbnail: Awaited<ReturnType<typeof generateThumbnail>> | null = null;
          let thumbnailMirror: UploadResult | null = null;
          try {
            generatedThumbnail = await generateThumbnail(tmpPaths[i]);
            const thumbnailBuffer = await readFile(generatedThumbnail.path);
            const baseName = path.parse(files[i].filename || 'video').name || 'video';
            thumbnailMirror = await uploadBuffer(thumbnailBuffer, 'image/jpeg', `${baseName}-thumbnail.jpg`);
          } catch (err) {
            logger.warn('[chat-attachment] Video thumbnail generation failed:', err);
          }
          await mirrorPromise;
          const mirror = mirrors[i];
          const thumbUrl = thumbnailMirror?.url ?? mirror.url;
          const pendingVideo = await createPendingMessage({
            contentType: 'video',
            content: JSON.stringify({ href: mirror.url, thumb: thumbUrl, thumbUrl, thumbnail: thumbUrl, size: mirror.size }),
          });
          try {
            const sendResult = await withZaloAttachmentTimeout(sendNativeVideo({
              api: instance.api as any,
              videoPath: tmpPaths[i],
              thumbnailPath: generatedThumbnail?.path,
              threadId,
              threadType: threadType as 0 | 1,
              message: caption,
            }));
            await reconcileConfirmed(pendingVideo, sendResult);
          } catch (err) {
            if (err instanceof ZaloAttachmentSendTimeoutError) {
              await keepPendingConfirmation([pendingVideo], 'native video send');
              continue;
            }
            logger.error('[chat-attachment] Native video send failed, trying fallback:', err);
            try {
              const sendResult = await withZaloAttachmentTimeout(zaloOps.sendFile(
                conversation.zaloAccountId,
                threadId,
                threadType as 0 | 1,
                [tmpPaths[i]],
                io,
              ));
              await reconcileConfirmed(pendingVideo, sendResult);
            } catch (fallbackErr) {
              if (fallbackErr instanceof ZaloAttachmentSendTimeoutError) {
                await keepPendingConfirmation([pendingVideo], 'fallback video send');
              } else {
                await markFailed([pendingVideo], fallbackErr);
              }
            }
          }
        }

        // Send files (generic) one-by-one
        for (const i of fileIndexes) {
          await mirrorPromise;
          const mirror = mirrors[i];
          const f = files[i];
          const pendingFile = await createPendingMessage({
            contentType: 'file',
            content: JSON.stringify({ href: mirror.url, name: f.filename, size: mirror.size, mime: f.mimeType }),
          });
          try {
            zaloRateLimiter.recordSend(conversation.zaloAccountId);
            const sendResult = await withZaloAttachmentTimeout(zaloOps.sendFile(
              conversation.zaloAccountId,
              threadId,
              threadType as 0 | 1,
              [tmpPaths[i]],
              io,
              caption,
            ));
            await reconcileConfirmed(pendingFile, sendResult);
          } catch (err) {
            if (err instanceof ZaloAttachmentSendTimeoutError) {
              await keepPendingConfirmation([pendingFile], 'file send');
            } else {
              await markFailed([pendingFile], err);
            }
          }
        }

        await prisma.conversation.update({
          where: { id },
          data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
        });

        await mirrorPromise;
        const attachmentTotalMs = Date.now() - attachmentRequestStartedAt;
        logger.info(`[chat-attachment][perf] stage=send_total files=${files.length} unconfirmed=${hasUnconfirmedSend} totalMs=${attachmentTotalMs}`);
        reply.header('Server-Timing', `chat-attachment;dur=${attachmentTotalMs}`);
        if (hasUnconfirmedSend) {
          return reply.status(202).send({
            messages: created,
            warning: 'Zalo received the send request but did not confirm in time. Messages remain visible while CRM reconciles the result.',
          });
        }
        if (hasFailedSend) {
          return reply.status(207).send({
            messages: created,
            warning: 'Một số file không gửi được. Các file thành công vẫn được giữ nguyên; không cần gửi lại cả lô.',
          });
        }
        return { messages: created };
      } catch (err: any) {
        logger.error('[chat-attachment] upload error:', err);
        return reply.status(500).send({ error: err?.message ?? 'attachment send failed' });
      } finally {
        // Clean tmp files (best effort)
        if (deferTmpCleanup) {
          const cleanupPaths = tmpPaths.filter(Boolean);
          const timer = setTimeout(() => {
            for (const p of cleanupPaths) void unlink(p).catch(() => {});
          }, 15 * 60_000);
          timer.unref?.();
        } else {
          for (const p of tmpPaths) {
            if (p) await unlink(p).catch(() => {});
          }
        }
      }
    },
  );
}
