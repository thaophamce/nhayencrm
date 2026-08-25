// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

import { prisma } from '../../shared/database/prisma-client.js';
import { snapshotAiFeatures, isAiFeatureEnabled, type AiFeatureName } from '../../shared/feature-flags.js';
import { logger } from '../../shared/utils/logger.js';

const EMERGENCY_STOP_SETTING_KEY = 'ai_emergency_stop_v1';

export type AiEmergencyStopState = {
  enabled: boolean;
  reason: string | null;
  stoppedAt: string | null;
  stoppedBy: string | null;
  clearedAt: string | null;
  clearedBy: string | null;
};

export class AiEmergencyStopError extends Error {
  code = 'ai_emergency_stop_active' as const;
}

type AiWorkerStopper = (reason: string) => Promise<void> | void;
const workerStoppers = new Set<AiWorkerStopper>();

const DEFAULT_STATE: AiEmergencyStopState = {
  enabled: false,
  reason: null,
  stoppedAt: null,
  stoppedBy: null,
  clearedAt: null,
  clearedBy: null,
};

function normalizeState(value: unknown): AiEmergencyStopState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.enabled !== 'boolean') return null;
  return {
    enabled: record.enabled,
    reason: typeof record.reason === 'string' ? record.reason : null,
    stoppedAt: typeof record.stoppedAt === 'string' ? record.stoppedAt : null,
    stoppedBy: typeof record.stoppedBy === 'string' ? record.stoppedBy : null,
    clearedAt: typeof record.clearedAt === 'string' ? record.clearedAt : null,
    clearedBy: typeof record.clearedBy === 'string' ? record.clearedBy : null,
  };
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized.slice(0, 500);
}

export function registerAiWorkerStopper(stopper: AiWorkerStopper): () => void {
  workerStoppers.add(stopper);
  return () => workerStoppers.delete(stopper);
}

export async function getEmergencyStopState(orgId: string): Promise<AiEmergencyStopState> {
  requireText(orgId, 'orgId');
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId, settingKey: EMERGENCY_STOP_SETTING_KEY } },
      select: { valuePlain: true },
    });
    if (!setting?.valuePlain) return { ...DEFAULT_STATE };
    return normalizeState(JSON.parse(setting.valuePlain)) ?? {
      ...DEFAULT_STATE,
      enabled: true,
      reason: 'Invalid emergency-stop state',
    };
  } catch (error) {
    logger.error(`[ai-emergency-stop] state read failed for org=${orgId}:`, error);
    return {
      ...DEFAULT_STATE,
      enabled: true,
      reason: 'Emergency-stop state unavailable',
    };
  }
}

export async function emergencyStop(orgId: string, reason: string, stoppedBy: string | null = null): Promise<AiEmergencyStopState> {
  const normalizedOrgId = requireText(orgId, 'orgId');
  const normalizedReason = requireText(reason, 'reason');
  const now = new Date().toISOString();
  const state: AiEmergencyStopState = {
    enabled: true,
    reason: normalizedReason,
    stoppedAt: now,
    stoppedBy: stoppedBy?.trim() || null,
    clearedAt: null,
    clearedBy: null,
  };

  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId: normalizedOrgId, settingKey: EMERGENCY_STOP_SETTING_KEY } },
    create: { orgId: normalizedOrgId, settingKey: EMERGENCY_STOP_SETTING_KEY, valuePlain: JSON.stringify(state) },
    update: { valuePlain: JSON.stringify(state) },
  });

  const results = await Promise.allSettled([...workerStoppers].map((stopper) => stopper(normalizedReason)));
  const failedWorkers = results.filter((result) => result.status === 'rejected').length;
  if (failedWorkers > 0) logger.error(`[ai-emergency-stop] ${failedWorkers} worker stopper(s) failed`);
  logger.error(`[ai-emergency-stop] ENABLED org=${normalizedOrgId} reason=${normalizedReason}`);
  return state;
}

export async function clearEmergencyStop(orgId: string, clearedBy: string | null = null): Promise<AiEmergencyStopState> {
  const normalizedOrgId = requireText(orgId, 'orgId');
  const current = await getEmergencyStopState(normalizedOrgId);
  const state: AiEmergencyStopState = {
    ...current,
    enabled: false,
    clearedAt: new Date().toISOString(),
    clearedBy: clearedBy?.trim() || null,
  };

  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId: normalizedOrgId, settingKey: EMERGENCY_STOP_SETTING_KEY } },
    create: { orgId: normalizedOrgId, settingKey: EMERGENCY_STOP_SETTING_KEY, valuePlain: JSON.stringify(state) },
    update: { valuePlain: JSON.stringify(state) },
  });

  logger.warn(`[ai-emergency-stop] CLEARED org=${normalizedOrgId}; feature flags still require explicit enablement`);
  return state;
}

export async function isAiActionAllowed(orgId: string, feature: AiFeatureName): Promise<boolean> {
  if (!isAiFeatureEnabled(feature)) return false;
  const state = await getEmergencyStopState(orgId);
  return !state.enabled;
}

export async function assertAiActionAllowed(orgId: string, feature: AiFeatureName): Promise<void> {
  if (snapshotAiFeatures().AI_EMERGENCY_STOP) throw new AiEmergencyStopError('AI emergency stop flag is enabled');
  if (!isAiFeatureEnabled(feature)) throw new Error(`AI feature disabled: ${feature}`);
  const state = await getEmergencyStopState(orgId);
  if (state.enabled) throw new AiEmergencyStopError(state.reason || 'AI emergency stop is active');
}
