<!--
═══════════════════════════════════════════════════════════════════════
 Luồng Mục Tiêu M9 — Tab FOLLOW-UP content (2026-06-02)
═══════════════════════════════════════════════════════════════════════

 Wire vào ChatContactPanel.vue line 468-477 (Tab FOLLOW-UP placeholder).
 Hiển thị danh sách N luồng Mục tiêu đang gắn 1 KH cụ thể + 4 buttons
 (Pause / Stop / Resume / Add new).

 API endpoints wire (đã ship Day 1+2 BE):
   GET  /api/v1/contacts/:cid/automation-status        → list cards
   POST /api/v1/automation/triggers/:tid/contacts/:cid/pause
   POST /api/v1/automation/triggers/:tid/contacts/:cid/stop
   POST /api/v1/automation/triggers/:tid/contacts/:cid/resume

 Mockup reference: 03-v2-tab-followup-content.html
-->

<template>
  <div class="auto-card-list">
    <!-- Loading state -->
    <div v-if="loading && !cards.length" class="loading-state">
      <div class="spinner" />
      <p>Đang tải...</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading && !cards.length" class="empty-state">
      <div class="empty-icon">🎯</div>
      <h3>Chưa có luồng bám đuổi nào</h3>
      <p>KH này hiện chưa được gắn vào Mục tiêu nào. Bạn có thể bám đuổi thủ công ngay.</p>
      <button class="add-flow-btn" @click="$emit('add-flow')">+ Gắn thêm luồng bám đuổi</button>
    </div>

    <!-- List of cards -->
    <template v-else>
      <div class="section-title">
        🎯 Đang trong Mục tiêu
        <span class="count">{{ activeCount }}</span>
      </div>

      <div
        v-for="card in cards"
        :key="card.triggerId"
        class="auto-card"
        :class="cardClass(card)"
      >
        <!-- Card head: name + system icon -->
        <div class="card-name">
          <span v-if="card.isSystemTrigger" class="system-icon" title="Mục tiêu hệ thống">🔒</span>
          {{ card.triggerName }}
        </div>

        <!-- Progress bar inline (nếu có currentStep) -->
        <div v-if="card.currentStep != null && card.totalSteps" class="progress-row">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :class="`fill-${card.state}`"
              :style="{ width: progressPct(card) + '%' }"
            />
          </div>
          <div class="progress-text">{{ card.currentStep + 1 }}/{{ card.totalSteps }}</div>
        </div>

        <!-- Meta info -->
        <div class="meta">
          <div v-if="card.state === 'active' && card.nextRunAt" class="meta-line">
            <span class="next">⏰ Lần tiếp: {{ formatTime(card.nextRunAt) }}</span>
          </div>
          <div v-else-if="card.state === 'paused'" class="meta-line">
            <span class="pause-info">⏸ Pause (còn {{ formatRemaining(card.pausedUntilMs) }})</span>
          </div>
          <div v-else-if="card.state === 'stopped'" class="meta-line">
            <span class="stopped-info">⏹ Đã dừng {{ formatTime(card.latestAt) }}</span>
          </div>
          <div v-if="card.nickName" class="meta-line">
            <span class="nick">👤 Nick: {{ card.nickName }}</span>
          </div>
          <div v-if="card.enrolledBy" class="meta-line">
            <span class="nick">· Sale enroll: {{ card.enrolledBy }}</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="actions">
          <template v-if="card.state === 'active'">
            <button class="auto-btn warning" :disabled="card.busy" @click="onAction(card, 'pause')">
              ⏸ Pause 24h
            </button>
            <button class="auto-btn danger" :disabled="card.busy" @click="onAction(card, 'stop')">
              🛑 Dừng hẳn
            </button>
          </template>
          <template v-else-if="card.state === 'paused'">
            <button class="auto-btn success" :disabled="card.busy" @click="onAction(card, 'resume')">
              ▶️ Tiếp tục ngay
            </button>
            <button class="auto-btn danger" :disabled="card.busy" @click="onAction(card, 'stop')">
              🛑 Dừng hẳn
            </button>
          </template>
          <template v-else>
            <button class="auto-btn" disabled>📋 Xem lịch sử</button>
          </template>
        </div>
      </div>

      <!-- Add new CTA -->
      <button class="add-flow-btn" @click="$emit('add-flow')">+ Gắn thêm luồng bám đuổi</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { api } from '@/api/index';

// ── Props ──
const props = defineProps<{
  contactId: string;
}>();

defineEmits<{
  'add-flow': [];
}>();

// ── Types ──
interface AutomationStatusCard {
  triggerId: string;
  triggerName: string;
  isSystemTrigger: boolean;
  systemKind?: string | null;
  latestEvent: string;
  latestAt: string;
  currentStep: number | null;
  totalSteps: number | null;
  pausedUntilMs: number;
  pausedUntil: string | null;
  stopped: boolean;
  // Derived UI state
  state?: 'active' | 'paused' | 'stopped';
  nickName?: string;
  nextRunAt?: string;
  enrolledBy?: string;
  busy?: boolean;
}

// ── State ──
const cards = ref<AutomationStatusCard[]>([]);
const loading = ref(false);

// ── Computed ──
const activeCount = computed(() =>
  cards.value.filter((c) => c.state === 'active' || c.state === 'paused').length,
);

// ── Helpers ──
function cardClass(card: AutomationStatusCard): Record<string, boolean> {
  return {
    paused: card.state === 'paused',
    stopped: card.state === 'stopped',
    'is-system': card.isSystemTrigger,
  };
}

function deriveState(card: AutomationStatusCard): 'active' | 'paused' | 'stopped' {
  if (card.stopped) return 'stopped';
  if (card.pausedUntilMs > 0) return 'paused';
  return 'active';
}

function progressPct(card: AutomationStatusCard): number {
  if (card.currentStep == null || !card.totalSteps) return 0;
  return Math.min(100, Math.round(((card.currentStep + 1) / card.totalSteps) * 100));
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / 3600_000;

  if (diffH >= 0 && diffH < 24) {
    return (
      d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh',
      }) + ' hôm nay'
    );
  }
  if (diffH >= 24 && diffH < 48) {
    return (
      d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh',
      }) + ' mai'
    );
  }
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0s';
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Fetch ──
async function fetchStatus(): Promise<void> {
  if (!props.contactId) return;
  loading.value = true;
  try {
    const res = await api.get<{
      contactId: string;
      triggers: AutomationStatusCard[];
    }>(`/api/v1/contacts/${props.contactId}/automation-status`);

    cards.value = (res.data.triggers ?? []).map((c) => ({
      ...c,
      state: deriveState(c),
      busy: false,
    }));
  } catch (err) {
    console.error('[automation-status] fetch failed', err);
    cards.value = [];
  } finally {
    loading.value = false;
  }
}

// ── Action: pause / stop / resume ──
async function onAction(
  card: AutomationStatusCard,
  kind: 'pause' | 'stop' | 'resume',
): Promise<void> {
  if (card.busy) return;

  if (kind === 'pause') {
    const ok = window.confirm(`Pause chuỗi "${card.triggerName}" trong 24h cho KH này?`);
    if (!ok) return;
    card.busy = true;
    try {
      await api.post(
        `/api/v1/automation/triggers/${card.triggerId}/contacts/${props.contactId}/pause`,
        { hours: 24 },
      );
      await fetchStatus();
    } catch (err) {
      console.error('[pause] failed', err);
      window.alert('Lỗi pause — thử lại sau');
    } finally {
      card.busy = false;
    }
  } else if (kind === 'stop') {
    const reason = window.prompt(`Dừng chuỗi "${card.triggerName}" cho KH này. Lý do (bắt buộc):`);
    if (!reason || !reason.trim()) return;
    card.busy = true;
    try {
      await api.post(
        `/api/v1/automation/triggers/${card.triggerId}/contacts/${props.contactId}/stop`,
        { reason: reason.trim() },
      );
      await fetchStatus();
    } catch (err) {
      console.error('[stop] failed', err);
      window.alert('Lỗi dừng — thử lại sau');
    } finally {
      card.busy = false;
    }
  } else if (kind === 'resume') {
    card.busy = true;
    try {
      await api.post(
        `/api/v1/automation/triggers/${card.triggerId}/contacts/${props.contactId}/resume`,
      );
      await fetchStatus();
    } catch (err) {
      console.error('[resume] failed', err);
      window.alert('Lỗi tiếp tục — thử lại sau');
    } finally {
      card.busy = false;
    }
  }
}

// ── Lifecycle ──
let pollHandle: number | null = null;

function startPolling(): void {
  if (pollHandle != null) return;
  // Refresh mỗi 30s khi tab visible (Page Visibility API)
  pollHandle = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void fetchStatus();
    }
  }, 30_000);
}

function stopPolling(): void {
  if (pollHandle != null) {
    window.clearInterval(pollHandle);
    pollHandle = null;
  }
}

onMounted(() => {
  void fetchStatus();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});

// Re-fetch khi đổi KH
watch(
  () => props.contactId,
  () => {
    void fetchStatus();
  },
);

// Expose refetch cho parent component (Modal close → refresh)
defineExpose({ refetch: fetchStatus });
</script>

<style scoped>
.auto-card-list {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Loading & Empty ── */
.loading-state,
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
}
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid #e5e7eb;
  border-top-color: #0068ff;
  border-radius: 50%;
  margin: 0 auto 12px;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.empty-state .empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.6;
}
.empty-state h3 {
  font-size: 14px;
  color: #172b4d;
  margin: 0 0 6px;
}
.empty-state p {
  font-size: 12px;
  margin: 0 0 16px;
}

/* ── Section title ── */
.section-title {
  font-size: 11px;
  font-weight: 700;
  color: #6b778c;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.section-title .count {
  background: #0068ff;
  color: white;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}

/* ── Card ── */
.auto-card {
  background: white;
  border: 1px solid #dfe1e6;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  box-shadow: 0 1px 2px rgba(9, 30, 66, 0.08);
  transition: 0.15s;
}
.auto-card:hover { border-color: #c1c7d0; }
.auto-card.paused {
  background: #fff7e6;
  border-color: #ff8b00;
}
.auto-card.stopped {
  background: #f4f5f7;
  opacity: 0.75;
}

.card-name {
  font-weight: 600;
  font-size: 13px;
  color: #172b4d;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.3;
}
.card-name .system-icon {
  color: #5b21b6;
  font-size: 13px;
}

/* Progress */
.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #42526e;
  margin-bottom: 6px;
}
.progress-bar {
  flex: 1;
  height: 6px;
  background: #f4f5f7;
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #0068ff;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.progress-fill.fill-paused { background: #ff8b00; }
.progress-fill.fill-stopped { background: #6b778c; }
.progress-text {
  font-size: 11px;
  font-weight: 600;
  color: #172b4d;
  white-space: nowrap;
  min-width: 32px;
  text-align: right;
}

/* Meta */
.meta {
  font-size: 11px;
  color: #6b778c;
  margin: 6px 0;
  line-height: 1.5;
}
.meta-line { display: block; }
.meta .next {
  color: #0068ff;
  font-weight: 500;
}
.meta .pause-info {
  color: #ff8b00;
  font-weight: 600;
}
.meta .stopped-info {
  color: #de350b;
  font-weight: 600;
}
.meta .nick {
  color: #42526e;
}

/* Actions */
.actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #dfe1e6;
}
.auto-card.stopped .actions {
  border-top: none;
  padding-top: 0;
}
.auto-btn {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #c1c7d0;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  background: white;
  color: #172b4d;
  font-weight: 500;
  transition: 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: inherit;
}
.auto-btn:hover:not(:disabled) {
  background: #ebf3ff;
}
.auto-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.auto-btn.warning {
  color: #ff8b00;
  border-color: #ff8b00;
}
.auto-btn.warning:hover:not(:disabled) { background: #fff7e6; }
.auto-btn.danger {
  color: #de350b;
  border-color: #de350b;
}
.auto-btn.danger:hover:not(:disabled) { background: #ffebe6; }
.auto-btn.success {
  color: #00875a;
  border-color: #00875a;
}
.auto-btn.success:hover:not(:disabled) { background: #e3fcef; }

/* Add CTA */
.add-flow-btn {
  width: 100%;
  padding: 11px 12px;
  background: #deebff;
  border: 1px dashed #0068ff;
  color: #0068ff;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  transition: 0.15s;
  font-family: inherit;
}
.add-flow-btn:hover {
  background: #0068ff;
  color: white;
}
</style>
