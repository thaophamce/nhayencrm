// Phase 7 — MessageTemplate CRUD routes.
// Scoped to the user's organization.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { logger } from '../../shared/utils/logger.js';

const BASE = '/api/v1/automation/templates';

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // List templates
  app.get(BASE, async (request: FastifyRequest) => {
    const user = request.user!;
    const q = request.query as Record<string, string | undefined>;

    const where: Record<string, any> = { orgId: user.orgId, archivedAt: null };
    if (q.search) {
      where.OR = [
        { shortcut: { contains: q.search, mode: 'insensitive' } },
        { content: { contains: q.search, mode: 'insensitive' } }
      ];
    }
    if (q.category) {
      where.category = q.category;
    }

    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return { templates };
  });

  // Create template
  app.post(BASE, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any;

    if (!body.shortcut || !body.content) {
      return reply.status(400).send({ error: 'shortcut and content are required' });
    }

    const created = await prisma.messageTemplate.create({
      data: {
        id: randomUUID(),
        orgId: user.orgId,
        shortcut: body.shortcut.trim(),
        name: body.shortcut.trim(),
        content: body.content.trim(),
        category: body.category || null,
        visibility: 'public',
        createdById: user.id,
        tagIds: body.tagIds || [],
        contentRich: body.contentRich || {
          text: body.content.trim(),
          styles: [],
          attachments: body.tagIds || []
        }
      }
    });

    return reply.status(201).send(created);
  });

  // Update template
  app.put(`${BASE}/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as any;

    const t = await prisma.messageTemplate.findFirst({
      where: { id, orgId: user.orgId }
    });
    if (!t) return reply.status(404).send({ error: 'template not found' });

    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: {
        shortcut: body.shortcut ? body.shortcut.trim() : undefined,
        name: body.shortcut ? body.shortcut.trim() : undefined,
        content: body.content ? body.content.trim() : undefined,
        category: body.category !== undefined ? body.category : undefined,
        tagIds: body.tagIds || undefined,
        contentRich: body.contentRich || (body.content ? {
          text: body.content.trim(),
          styles: [],
          attachments: body.tagIds || []
        } : undefined)
      }
    });

    return updated;
  });

  // Delete template
  app.delete(`${BASE}/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const t = await prisma.messageTemplate.findFirst({
      where: { id, orgId: user.orgId }
    });
    if (!t) return reply.status(404).send({ error: 'template not found' });

    await prisma.messageTemplate.update({
      where: { id },
      data: { archivedAt: new Date() }
    });

    return { success: true };
  });

  // Dummy folders endpoints for frontend compatibility
  app.get('/api/v1/automation/template-folders', async () => {
    return { folders: [] };
  });
}
