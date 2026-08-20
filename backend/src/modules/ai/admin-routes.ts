// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

import type { FastifyInstance } from 'fastify';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { getEmergencyStopState, emergencyStop, clearEmergencyStop } from './emergency-stop.js';
import { snapshotAiFeatures } from '../../shared/feature-flags.js';
import { assertAiActionAllowed } from './emergency-stop.js';

export type AdminControlState = {
  features: ReturnType<typeof snapshotAiFeatures>;
  emergencyStop: Awaited<ReturnType<typeof getEmergencyStopState>>;
};

let circuitForceCloseHook: (() => void) | null = null;
let circuitStateHook: (() => unknown) | null = null;

export function registerAiAdminControlHooks(hooks: { circuitForceClose?: () => void; circuitState?: () => unknown }): void {
  if (hooks.circuitForceClose) circuitForceCloseHook = hooks.circuitForceClose;
  if (hooks.circuitState) circuitStateHook = hooks.circuitState;
}

export async function aiAdminControlRoutes(app: FastifyInstance): Promise<void> {
  

  app.get('/api/v1/ai/admin/state', { preHandler: requireGrant('settings', 'access') }, async (request) => {
    const orgId = request.user!.orgId;
    const stop = await getEmergencyStopState(orgId);
    return {
      features: snapshotAiFeatures(),
      emergencyStop: stop,
      circuit: circuitStateHook ? circuitStateHook() : null,
    };
  });

  app.post('/api/v1/ai/admin/emergency-stop', { preHandler: requireGrant('settings', 'edit') }, async (request, reply) => {
    const body = request.body as { reason?: string; stoppedBy?: string };
    if (!body?.reason || typeof body.reason !== 'string') {
      return reply.status(400).send({ error: 'reason is required' });
    }
    const state = await emergencyStop(request.user!.orgId, body.reason, body.stoppedBy ?? request.user!.id);
    return state;
  });

  app.post('/api/v1/ai/admin/emergency-resume', { preHandler: requireGrant('settings', 'edit') }, async (request) => {
    const body = request.body as { clearedBy?: string };
    const state = await clearEmergencyStop(request.user!.orgId, body?.clearedBy ?? request.user!.id);
    return state;
  });

  app.post('/api/v1/ai/admin/circuit/close', { preHandler: requireGrant('settings', 'edit') }, async () => {
    if (!circuitForceCloseHook) return { forced: false };
    circuitForceCloseHook();
    return { forced: true };
  });

  app.post('/api/v1/ai/admin/action/check', { preHandler: requireGrant('settings', 'edit') }, async (request, reply) => {
    const body = request.body as { feature?: string };
    const allowedFeatures = ['AI_DRAFT', 'AI_SIMULATION', 'AI_AUTOREPLY'];
    if (!body?.feature || !allowedFeatures.includes(body.feature)) {
      return reply.status(400).send({ error: 'feature invalid' });
    }
    try {
      await assertAiActionAllowed(request.user!.orgId, body.feature as 'AI_DRAFT');
      return { feature: body.feature, allowed: true };
    } catch (error) {
      return { feature: body.feature, allowed: false, reason: error instanceof Error ? error.message : 'denied' };
    }
  });
}