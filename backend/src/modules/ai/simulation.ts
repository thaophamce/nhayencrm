// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc

export type SimulationEntry = {
  id: string;
  orgId: string;
  conversationId: string;
  inboundMessageId: string;
  aiIntent: string;
  aiTier: string;
  aiConfidence: number;
  aiReply: string;
  kbCitations: string[];
  humanAction: 'pending' | 'accepted' | 'edited' | 'rejected' | 'ignored';
  humanReply?: string;
  createdAt: string;
  updatedAt: string;
};

export type MetricsSnapshot = {
  generated: number;
  accepted: number;
  edited: number;
  rejected: number;
  ignored: number;
  acceptanceRate: number;
  editRate: number;
  hallucinationEstimate: number;
  byTier: Record<string, number>;
};

export class SimulationStore {
  private entries = new Map<string, SimulationEntry>();
  private idCounter = 0;

  record(input: Omit<SimulationEntry, 'id' | 'createdAt' | 'updatedAt' | 'humanAction'>): SimulationEntry {
    const now = new Date().toISOString();
    const entry: SimulationEntry = {
      ...input,
      id: `sim_${(++this.idCounter).toString().padStart(6, '0')}`,
      humanAction: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  recordOutcome(id: string, outcome: { humanAction: SimulationEntry['humanAction']; humanReply?: string }): SimulationEntry | null {
    const current = this.entries.get(id);
    if (!current) return null;
    const updated: SimulationEntry = {
      ...current,
      ...outcome,
      updatedAt: new Date().toISOString(),
    };
    this.entries.set(id, updated);
    return updated;
  }

  snapshot(): MetricsSnapshot {
    let generated = 0;
    let accepted = 0;
    let edited = 0;
    let rejected = 0;
    let ignored = 0;
    let hallucinations = 0;
    const byTier: Record<string, number> = {};
    for (const entry of this.entries.values()) {
      generated += 1;
      byTier[entry.aiTier] = (byTier[entry.aiTier] ?? 0) + 1;
      if (entry.humanAction === 'accepted') accepted += 1;
      else if (entry.humanAction === 'edited') {
        edited += 1;
        if (entry.aiReply && entry.humanReply && entry.aiReply !== entry.humanReply) hallucinations += 1;
      }
      else if (entry.humanAction === 'rejected') rejected += 1;
      else if (entry.humanAction === 'ignored') ignored += 1;
    }
    const decided = accepted + edited + rejected + ignored;
    return {
      generated,
      accepted,
      edited,
      rejected,
      ignored,
      acceptanceRate: decided === 0 ? 0 : round2((accepted + edited) / decided),
      editRate: decided === 0 ? 0 : round2(edited / decided),
      hallucinationEstimate: edited === 0 ? 0 : round2(hallucinations / edited),
      byTier,
    };
  }

  all(): SimulationEntry[] {
    return [...this.entries.values()];
  }

  reset(): void {
    this.entries.clear();
    this.idCounter = 0;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type DebounceState = {
  conversationId: string;
  inboundMessageIds: string[];
  pendingFire: NodeJS.Timeout | null;
};

export class Debouncer {
  private states = new Map<string, DebounceState>();
  constructor(private readonly fire: (ids: string[]) => Promise<void>, private readonly windowMs: number) {}

  enqueue(conversationId: string, inboundMessageId: string): void {
    const existing = this.states.get(conversationId) ?? { conversationId, inboundMessageIds: [], pendingFire: null };
    existing.inboundMessageIds.push(inboundMessageId);
    if (existing.pendingFire) clearTimeout(existing.pendingFire);
    existing.pendingFire = setTimeout(() => this.flush(conversationId), this.windowMs);
    this.states.set(conversationId, existing);
  }

  async flush(conversationId: string): Promise<void> {
    const state = this.states.get(conversationId);
    if (!state) return;
    if (state.pendingFire) clearTimeout(state.pendingFire);
    const ids = state.inboundMessageIds.splice(0, state.inboundMessageIds.length);
    this.states.delete(conversationId);
    if (ids.length === 0) return;
    await this.fire(ids);
  }

  pending(conversationId: string): string[] {
    return [...(this.states.get(conversationId)?.inboundMessageIds ?? [])];
  }

  resetAll(): void {
    for (const state of this.states.values()) if (state.pendingFire) clearTimeout(state.pendingFire);
    this.states.clear();
  }
}

export type TakeoverState = {
  conversationId: string;
  humanUntil: number;
  reason: 'opened' | 'sent' | 'edited' | 'manual';
  releasedBy: string | null;
};

export class TakeoverRegistry {
  private states = new Map<string, TakeoverState>();

  mark(input: { conversationId: string; reason: TakeoverState['reason']; releasedBy: string | null; holdMs: number; now?: number }): TakeoverState {
    const state: TakeoverState = {
      conversationId: input.conversationId,
      humanUntil: (input.now ?? Date.now()) + input.holdMs,
      reason: input.reason,
      releasedBy: input.releasedBy,
    };
    this.states.set(input.conversationId, state);
    return state;
  }

  isHumanActive(conversationId: string, now: number = Date.now()): boolean {
    const state = this.states.get(conversationId);
    if (!state) return false;
    if (state.humanUntil <= now) {
      this.states.delete(conversationId);
      return false;
    }
    return true;
  }

  clear(conversationId: string): boolean {
    return this.states.delete(conversationId);
  }
}