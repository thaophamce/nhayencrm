// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * priority-service.ts — "Priority Score" cho Contact.
 *
 * Priority Score = Lead Score (ý định mua — keyword + behavior signals).
 * Trước đây có cộng thêm Engagement Score/Trend, nhưng hệ thống Auto
 * Engagement đã bị xoá — xem git history nếu cần công thức cũ.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface PriorityInputs {
  leadScore: number;
}

/**
 * Pure compute — no DB, no side effects. Returns 0-100 clamped integer.
 */
export function computePriorityScore(inputs: PriorityInputs): number {
  const lead = Number.isFinite(inputs.leadScore) ? inputs.leadScore : 0;
  return Math.round(Math.max(0, Math.min(100, lead)));
}

/**
 * Recompute priority for 1 Contact + persist. Called from hooks + cron.
 *
 * Reads current leadScore from Contact row. Returns the computed priority
 * for callers that want to log delta or emit socket.
 */
export async function recomputeContactPriority(contactId: string): Promise<number | null> {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        leadScore: true,
        priorityScore: true,
      },
    });
    if (!contact) return null;

    const priority = computePriorityScore({
      leadScore: contact.leadScore,
    });

    // Skip write if unchanged (saves index churn on large orgs)
    if (priority === contact.priorityScore) return priority;

    await prisma.contact.update({
      where: { id: contactId },
      data: {
        priorityScore: priority,
        priorityUpdatedAt: new Date(),
      },
    });
    return priority;
  } catch (err) {
    logger.warn('[priority-service] recompute failed', {
      contactId,
      err: (err as Error).message,
    });
    return null;
  }
}

/**
 * Bulk recompute for all contacts in org (cron + admin endpoint).
 */
export async function recomputeAllPriorities(orgId: string): Promise<{ updated: number; total: number }> {
  const contacts = await prisma.contact.findMany({
    where: { orgId },
    select: { id: true },
  });
  let updated = 0;
  for (const c of contacts) {
    const result = await recomputeContactPriority(c.id);
    if (result !== null) updated++;
  }
  return { updated, total: contacts.length };
}
