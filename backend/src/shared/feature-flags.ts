// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

export const AI_FEATURE_NAMES = [
  'AI_DRAFT',
  'AI_SIMULATION',
  'AI_AUTOREPLY',
  'AI_EMERGENCY_STOP',
] as const;

export type AiFeatureName = (typeof AI_FEATURE_NAMES)[number];

function readBooleanFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === 'true' || value === '1' || value === 'on') return true;
  if (value === 'false' || value === '0' || value === 'off') return false;
  return false;
}

function readFeatures(): Record<AiFeatureName, boolean> {
  return {
    AI_DRAFT: readBooleanFlag('AI_DRAFT'),
    AI_SIMULATION: readBooleanFlag('AI_SIMULATION'),
    AI_AUTOREPLY: readBooleanFlag('AI_AUTOREPLY'),
    AI_EMERGENCY_STOP: readBooleanFlag('AI_EMERGENCY_STOP'),
  };
}

export function isAiFeatureEnabled(feature: AiFeatureName): boolean {
  const features = readFeatures();
  if (features.AI_EMERGENCY_STOP) return false;
  return features[feature];
}

export function snapshotAiFeatures(): Readonly<Record<AiFeatureName, boolean>> {
  return Object.freeze(readFeatures());
}