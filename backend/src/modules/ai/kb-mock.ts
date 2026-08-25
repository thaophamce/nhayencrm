// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

import { emptyKbSnapshot, type KbSnapshot } from '../../shared/kb.js';

const STUB_KB: KbSnapshot = emptyKbSnapshot('kb-stub');

export function snapshotToKb(): KbSnapshot {
  return STUB_KB;
}