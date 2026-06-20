// FIX 2026-06-12 — Regression test cho viết lại materializeFromEvent → BullMQ
// (vết gãy #2). Trước đây hàm ghi vào AutomationTask stub (đã drop) → 0 việc thật
// → Mục tiêu kích bằng SỰ KIỆN không bám đuổi được KH. Giờ enqueue BullMQ thật.
//
// Phủ các nhánh anh chốt (D4/D5/D7):
//   - sequence-bound: chọn nick + enqueueSequenceStart  (happy path)
//   - đa-luồng: KH ở Luồng A vẫn vào được Luồng B (KHÔNG còn mutex chặn)  ← D5
//   - block-bound: skip CÓ CẢNH BÁO (không nuốt im)  ← D7
//   - no nick (KH chưa là bạn nick nào): skip ghi lý do, KHÔNG enqueue
//   - nick scope: truyền segmentSpec.nickIds xuống selector

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock nick-selector: bắt args + điều khiển kết quả ────────────────────────
// CHIA CỨNG 2026-06-20: materializer gọi resolveEligibleNicks (pool) rồi
// pickNickWithFailover (per KH, round-robin + failover).
const resolveEligibleNicks = vi.fn();
const pickNickWithFailover = vi.fn();
vi.mock('../src/modules/automation/engine/nick-selector.js', () => ({
  resolveEligibleNicks: (...a: unknown[]) => (resolveEligibleNicks as any)(...a),
  pickNickWithFailover: (...a: unknown[]) => (pickNickWithFailover as any)(...a),
}));

// ── Mock enqueueSequenceStart: bắt mọi lần enqueue ───────────────────────────
const enqueueSequenceStart = vi.fn(async () => undefined);
vi.mock('../src/modules/automation/queues/sequence-step-worker.js', () => ({
  enqueueSequenceStart: (...a: unknown[]) => (enqueueSequenceStart as any)(...a),
}));

// queue-registry (chỉ cần tồn tại — materializeSequenceForContact path không test ở đây)
vi.mock('../src/modules/automation/queues/queue-registry.js', () => ({
  buildSequenceStepJobId: (t: string, c: string, i: number) => `${t}-${c}-${i}`,
  getSequenceStepQueue: () => ({ add: vi.fn(), getJob: vi.fn(async () => null) }),
}));

// segment-resolver: trả contactIds cố định
vi.mock('../src/modules/automation/engine/segment-resolver.js', () => ({
  resolveSegmentToContactIds: vi.fn(async () => ({ contactIds: ['c1'], rejected: [] })),
}));

// ── Mock prisma ──────────────────────────────────────────────────────────────
const db = {
  triggers: [] as any[],
  campaignFindFirst: null as any,
  block: { id: 'b1', archivedAt: null } as any,
};
vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    automationTrigger: { findMany: vi.fn(async () => db.triggers) },
    automationCampaign: {
      findFirst: vi.fn(async () => db.campaignFindFirst),
      create: vi.fn(async () => ({ id: 'camp1' })),
    },
    block: { findFirst: vi.fn(async () => db.block) },
    // FIX 2026-06-20: mock cũ thiếu careSession → resolveNextEnrollEpoch crash khiến
    // mọi test đi tới enqueue đỏ sẵn trên main. enrollEpoch=null → lần đầu (epoch=1).
    careSession: { aggregate: vi.fn(async () => ({ _max: { enrollEpoch: null }, _count: { _all: 0 } })) },
  },
}));

import { materializeFromEvent } from '../src/modules/automation/engine/campaign-materializer.js';

function seqTrigger(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    bindingKind: 'sequence',
    sequenceId: 's1',
    blockId: null,
    eventFilter: null,
    segmentSpec: null,
    ruleOverrides: null,
    sequence: { id: 's1', enabled: true, steps: [{ stepId: 'st1', blockId: 'b1', delayMinutes: 5 }], runtimeRules: {} },
    ...over,
  };
}

const event = { type: 'silent_x_days', orgId: 'org1', occurredAt: new Date(0), contactId: 'c1' } as any;

beforeEach(() => {
  resolveEligibleNicks.mockReset();
  pickNickWithFailover.mockReset();
  resolveEligibleNicks.mockResolvedValue(['n1']); // mặc định: 1 nick eligible
  enqueueSequenceStart.mockClear();
  db.triggers = [];
  db.campaignFindFirst = null;
  db.block = { id: 'b1', archivedAt: null };
});

describe('materializeFromEvent → BullMQ (vết gãy #2)', () => {
  it('sequence-bound: chọn nick + enqueueSequenceStart (happy path)', async () => {
    db.triggers = [seqTrigger()];
    pickNickWithFailover.mockResolvedValue({ nickId: 'n1', zaloUidInNick: 'u1', reason: 'existing_friend', attempts: [] });

    const r = await materializeFromEvent(event);

    expect(enqueueSequenceStart).toHaveBeenCalledTimes(1);
    expect(enqueueSequenceStart).toHaveBeenCalledWith(
      expect.objectContaining({ triggerId: 't1', contactId: 'c1', sequenceId: 's1', nickId: 'n1', startDelayMinutes: 5 }),
    );
    expect(r.tasksEnqueued).toBe(1);
  });

  it('D5 đa-luồng: KHÔNG có mutex chặn — mỗi Mục tiêu enqueue độc lập', async () => {
    // 2 trigger khác sequence cho cùng KH → cả 2 phải enqueue (không cái nào bị skip vì "đang ở luồng khác")
    db.triggers = [seqTrigger({ id: 'tA', sequenceId: 'sA', sequence: { id: 'sA', enabled: true, steps: [{ stepId: 'x', blockId: 'b1', delayMinutes: 0 }], runtimeRules: {} } }),
                   seqTrigger({ id: 'tB', sequenceId: 'sB', sequence: { id: 'sB', enabled: true, steps: [{ stepId: 'y', blockId: 'b1', delayMinutes: 0 }], runtimeRules: {} } })];
    pickNickWithFailover.mockResolvedValue({ nickId: 'n1', zaloUidInNick: 'u1', reason: 'existing_friend', attempts: [] });

    const r = await materializeFromEvent(event);

    expect(enqueueSequenceStart).toHaveBeenCalledTimes(2); // cả 2 luồng, không bị mutex chặn
    expect(r.tasksEnqueued).toBe(2);
  });

  it('tra UID ko ra mọi nick: skip ghi lý do sự cố, KHÔNG enqueue', async () => {
    db.triggers = [seqTrigger()];
    pickNickWithFailover.mockResolvedValue({ nickId: null, attempts: [{ nickId: 'n1', code: 'NO_ZALO', detail: 'x' }] });

    const r = await materializeFromEvent(event);

    expect(enqueueSequenceStart).not.toHaveBeenCalled();
    expect(r.tasksEnqueued).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.reasons.some((x) => x.includes('no_sendable_nick') && x.includes('NO_ZALO'))).toBe(true);
  });

  it('no_eligible_nick (không nick connected/còn cap): skip cả trigger, KHÔNG enqueue', async () => {
    db.triggers = [seqTrigger()];
    resolveEligibleNicks.mockResolvedValue([]);

    const r = await materializeFromEvent(event);

    expect(pickNickWithFailover).not.toHaveBeenCalled();
    expect(enqueueSequenceStart).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    expect(r.reasons.some((x) => x.includes('no_eligible_nick'))).toBe(true);
  });

  it('nick scope: segmentSpec.nickIds → pool + chia cứng round-robin', async () => {
    db.triggers = [seqTrigger({ segmentSpec: { nickIds: ['nA', 'nB'] } })];
    resolveEligibleNicks.mockResolvedValue(['nA', 'nB']);
    pickNickWithFailover.mockResolvedValue({ nickId: 'nA', zaloUidInNick: 'u1', reason: 'existing_friend', attempts: [] });

    await materializeFromEvent(event);

    // pool lọc từ allowedNickIds = segmentSpec.nickIds
    expect(resolveEligibleNicks).toHaveBeenCalledWith('org1', ['nA', 'nB']);
    // KH đầu (i=0) bắt đầu ở nick đầu pool → thứ tự failover = [nA, nB]
    expect(pickNickWithFailover).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org1', contactId: 'c1', orderedNickIds: ['nA', 'nB'] }),
    );
  });

  it('D7 block-bound: skip CÓ CẢNH BÁO, KHÔNG enqueue, KHÔNG nuốt im', async () => {
    db.triggers = [seqTrigger({ id: 'tBlk', bindingKind: 'block', sequenceId: null, blockId: 'b1', sequence: null })];

    const r = await materializeFromEvent(event);

    expect(enqueueSequenceStart).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    expect(r.reasons.some((x) => x.includes('block-bound'))).toBe(true);
  });

  it('sequence disabled: skip, KHÔNG enqueue', async () => {
    db.triggers = [seqTrigger({ sequence: { id: 's1', enabled: false, steps: [], runtimeRules: {} } })];

    const r = await materializeFromEvent(event);

    expect(enqueueSequenceStart).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
  });
});
