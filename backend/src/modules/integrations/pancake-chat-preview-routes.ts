// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { encryptToken, decryptToken } from './_shared/token-encryption.util.js';

const INTEGRATION_TYPE = 'pancake_chat';

interface PancakeConversation {
  id: string;
  type?: string;
  message_count?: number;
  updated_at?: string;
  snippet?: string | null;
  from?: { id?: string; name?: string; avatar_url?: string; is_group?: boolean };
  page_customer?: { id?: string; name?: string };
}

interface PancakeConfig {
  encryptedToken: string;
  pageId: string;
}

function isLocalRequest(request: { hostname: string; ip: string }): boolean {
  const host = request.hostname.toLowerCase();
  const loopbackIp = request.ip === '127.0.0.1'
    || request.ip === '::1'
    || request.ip === '::ffff:127.0.0.1';
  return process.env.PANCAKE_CHAT_PREVIEW_ENABLED === 'true'
    && (host === 'localhost' || host === '127.0.0.1' || host === '::1')
    && loopbackIp;
}

function readToken(value?: string): { token: string; pageId: string } {
  const token = value?.trim() ?? '';
  if (token.length < 40 || token.length > 4096) throw new Error('Token Pancake không hợp lệ.');
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { id?: string };
    if (!decoded.id?.startsWith('pzl_')) throw new Error();
    return { token, pageId: decoded.id };
  } catch {
    throw new Error('Token không chứa mã kênh Zalo Pancake.');
  }
}

function parseConfig(value: Prisma.JsonValue): PancakeConfig {
  const config = value as Record<string, unknown>;
  if (typeof config?.encryptedToken !== 'string' || typeof config?.pageId !== 'string') {
    throw new Error('Cấu hình kết nối Pancake bị thiếu.');
  }
  return { encryptedToken: config.encryptedToken, pageId: config.pageId };
}

async function pancakeRequest<T>(path: string, token: string, init?: RequestInit) {
  const endpoint = new URL(path, 'https://pages.fm');
  endpoint.searchParams.set('page_access_token', token);
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as T & { success?: boolean; error?: string };
  return { response, payload };
}

function mapConversations(items: PancakeConversation[]) {
  return items.map((conversation) => ({
    id: String(conversation.id),
    name: conversation.from?.name || conversation.page_customer?.name || 'Hội thoại Zalo',
    avatarUrl: conversation.from?.avatar_url || null,
    isGroup: conversation.from?.is_group === true || String(conversation.id).startsWith('pzl_g_'),
    messageCount: Number(conversation.message_count) || 0,
    updatedAt: conversation.updated_at || null,
    snippet: conversation.snippet || null,
  }));
}

async function fetchConversations(pageId: string, token: string) {
  const path = `/api/public_api/v2/pages/${encodeURIComponent(pageId)}/conversations?order_by=updated_at`;
  const { response, payload } = await pancakeRequest<{ conversations?: PancakeConversation[] }>(path, token);
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || `Pancake trả lỗi ${response.status}.`);
    (error as Error & { statusCode?: number }).statusCode =
      response.status === 401 || response.status === 403 ? 401 : 502;
    throw error;
  }
  return mapConversations(Array.isArray(payload.conversations) ? payload.conversations : []);
}

function connectionView(connection: {
  id: string; name: string; enabled: boolean; updatedAt: Date; config: Prisma.JsonValue;
}) {
  const { pageId } = parseConfig(connection.config);
  return {
    id: connection.id,
    name: connection.name,
    enabled: connection.enabled,
    pageId,
    displayName: connection.name || `Pancake Zalo • ${pageId.slice(-6)}`,
    status: connection.enabled ? 'connected' : 'disabled',
    updatedAt: connection.updatedAt,
  };
}

export async function pancakeChatPreviewRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    if (!isLocalRequest(request)) return reply.status(404).send({ error: 'Not found' });
    return authMiddleware(request, reply);
  });

  app.get('/api/v1/dev/pancake-chat/connections', async (request) => {
    const rows = await prisma.integration.findMany({
      where: { orgId: request.user!.orgId, type: INTEGRATION_TYPE },
      orderBy: { updatedAt: 'desc' },
    });
    return { connections: rows.map(connectionView) };
  });

  app.post<{ Body: { token?: string; name?: string } }>(
    '/api/v1/dev/pancake-chat/connections',
    async (request, reply) => {
      let credentials: { token: string; pageId: string };
      try {
        credentials = readToken(request.body?.token);
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }

      let conversations;
      try {
        conversations = await fetchConversations(credentials.pageId, credentials.token);
      } catch (error) {
        const status = (error as Error & { statusCode?: number }).statusCode ?? 502;
        return reply.status(status).send({ error: (error as Error).message });
      }

      const orgId = request.user!.orgId;
      const existing = await prisma.integration.findFirst({
        where: { orgId, type: INTEGRATION_TYPE, config: { path: ['pageId'], equals: credentials.pageId } },
      });
      const name = request.body?.name?.trim().slice(0, 120)
        || `Pancake Zalo • ${credentials.pageId.slice(-6)}`;
      const config = {
        pageId: credentials.pageId,
        encryptedToken: encryptToken(credentials.token),
      } satisfies PancakeConfig;
      const connection = existing
        ? await prisma.integration.update({
          where: { id: existing.id },
          data: { name, config, enabled: true },
        })
        : await prisma.integration.create({
          data: { orgId, type: INTEGRATION_TYPE, name, config, enabled: true },
        });

      return reply.status(existing ? 200 : 201).send({
        connection: connectionView(connection),
        conversations,
      });
    },
  );

  async function resolveConnection(orgId: string, id: string) {
    const connection = await prisma.integration.findFirst({
      where: { id, orgId, type: INTEGRATION_TYPE, enabled: true },
    });
    if (!connection) return null;
    const config = parseConfig(connection.config);
    return { connection, pageId: config.pageId, token: decryptToken(config.encryptedToken) };
  }

  app.get<{ Params: { connectionId: string } }>(
    '/api/v1/dev/pancake-chat/connections/:connectionId/conversations',
    async (request, reply) => {
      const resolved = await resolveConnection(request.user!.orgId, request.params.connectionId);
      if (!resolved) return reply.status(404).send({ error: 'Không tìm thấy kết nối Pancake.' });
      try {
        const conversations = await fetchConversations(resolved.pageId, resolved.token);
        return { connection: connectionView(resolved.connection), conversations };
      } catch (error) {
        return reply.status((error as any).statusCode ?? 502).send({ error: (error as Error).message });
      }
    },
  );

  app.get<{ Params: { connectionId: string; conversationId: string }; Querystring: { currentCount?: string } }>(
    '/api/v1/dev/pancake-chat/connections/:connectionId/conversations/:conversationId/messages',
    async (request, reply) => {
      const resolved = await resolveConnection(request.user!.orgId, request.params.connectionId);
      if (!resolved) return reply.status(404).send({ error: 'Không tìm thấy kết nối Pancake.' });
      const currentCount = Math.max(0, Math.min(Number(request.query.currentCount) || 0, 3000));
      const path = `/api/public_api/v1/pages/${encodeURIComponent(resolved.pageId)}`
        + `/conversations/${encodeURIComponent(request.params.conversationId)}/messages`
        + `?current_count=${currentCount}`;
      try {
        const { response, payload } = await pancakeRequest<{ messages?: Array<Record<string, any>> }>(path, resolved.token);
        if (!response.ok || payload.success === false) {
          return reply.status(response.status === 401 || response.status === 403 ? 401 : 502)
            .send({ error: payload.error || `Không tải được tin nhắn (${response.status}).` });
        }
        const messages = (Array.isArray(payload.messages) ? payload.messages : []).map((message) => {
          const from = message.from ?? {};
          const attachments = Array.isArray(message.attachments) ? message.attachments : [];
          return {
            id: String(message.id ?? ''),
            content: String(message.original_message ?? message.message ?? ''),
            sentAt: message.inserted_at ?? null,
            senderName: String(from.name ?? from.admin_name ?? ''),
            isSelf: from.id === resolved.pageId
              || from.id === resolved.pageId.replace(/^pzl_/, '')
              || Boolean(from.admin_id),
            attachments: attachments.map((attachment: Record<string, any>) => ({
              type: String(attachment.type ?? ''),
              url: String(attachment.url ?? attachment.video_data?.url ?? ''),
              title: String(attachment.title ?? ''),
              mimeType: String(attachment.mime_type ?? ''),
            })).filter((attachment: { url: string }) => attachment.url.startsWith('https://')),
            isRemoved: Boolean(message.is_removed),
          };
        });
        return { messages };
      } catch {
        return reply.status(502).send({ error: 'Không kết nối được Pancake để tải tin nhắn.' });
      }
    },
  );

  app.post<{ Params: { connectionId: string; conversationId: string }; Body: { message?: string } }>(
    '/api/v1/dev/pancake-chat/connections/:connectionId/conversations/:conversationId/messages',
    async (request, reply) => {
      const resolved = await resolveConnection(request.user!.orgId, request.params.connectionId);
      if (!resolved) return reply.status(404).send({ error: 'Không tìm thấy kết nối Pancake.' });
      const message = request.body?.message?.trim() ?? '';
      if (!message || message.length > 5000) {
        return reply.status(400).send({ error: 'Nội dung tin nhắn phải từ 1 đến 5000 ký tự.' });
      }
      const path = `/api/public_api/v1/pages/${encodeURIComponent(resolved.pageId)}`
        + `/conversations/${encodeURIComponent(request.params.conversationId)}/messages`;
      try {
        const { response, payload } = await pancakeRequest<Record<string, unknown>>(path, resolved.token, {
          method: 'POST',
          body: JSON.stringify({ message }),
        });
        if (!response.ok || payload.success === false) {
          return reply.status(response.status === 401 || response.status === 403 ? 401 : 502)
            .send({ error: payload.error || `Pancake chưa gửi được tin (${response.status}).` });
        }
        return { success: true };
      } catch {
        return reply.status(502).send({ error: 'Không kết nối được Pancake để gửi tin.' });
      }
    },
  );

  app.delete<{ Params: { connectionId: string } }>(
    '/api/v1/dev/pancake-chat/connections/:connectionId',
    async (request, reply) => {
      const existing = await prisma.integration.findFirst({
        where: { id: request.params.connectionId, orgId: request.user!.orgId, type: INTEGRATION_TYPE },
      });
      if (!existing) return reply.status(404).send({ error: 'Không tìm thấy kết nối Pancake.' });
      await prisma.integration.delete({ where: { id: existing.id } });
      return { success: true };
    },
  );
}
