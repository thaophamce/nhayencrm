<!--
═══════════════════════════════════════════════════════════════════════
 Luồng Mục Tiêu M9 — Modal "+ Gắn thêm luồng bám đuổi" (2026-06-02)
═══════════════════════════════════════════════════════════════════════

 Hiển thị khi sale bấm nút "+ Gắn thêm luồng bám đuổi" trong tab FOLLOW-UP.
 Cho phép sale enroll 1 KH ad-hoc vào "Mục tiêu hệ thống — Bám đuổi thủ công"
 với 1 sequence được chọn + nick đang chat được auto-pin.

 API endpoint (BE đã ship M9):
   POST /api/v1/chat/contacts/:cid/manual-enroll
   Body: { sequenceId, nickId, reason }

 Mockup reference: 03-v2-tab-followup-content.html (modal phần dưới)
-->

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="onClose">
      <div class="modal" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="modal-header">
          <h2>+ Bám đuổi thủ công cho {{ contactName }}</h2>
          <button class="modal-close" @click="onClose" aria-label="Đóng">×</button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          <!-- Loading sequences -->
          <div v-if="loadingSequences" class="loading">
            <div class="spinner" />
            <p>Đang tải danh sách Sequence...</p>
          </div>

          <template v-else>
            <!-- Sequence picker -->
            <div class="form-group">
              <label>
                Chọn Sequence (chuỗi tin có sẵn)
                <span class="req">*</span>
              </label>

              <div v-if="sequences.length === 0" class="empty-seq">
                Chưa có Sequence nào active trong tổ chức.
                <a href="/marketing/sequences" target="_blank">→ Tạo Sequence mới</a>
              </div>

              <div
                v-for="seq in sequences"
                :key="seq.id"
                class="sequence-radio"
                :class="{ selected: selectedSequenceId === seq.id }"
                @click="selectedSequenceId = seq.id"
              >
                <input
                  type="radio"
                  :checked="selectedSequenceId === seq.id"
                  @change="selectedSequenceId = seq.id"
                />
                <div class="info">
                  <div class="name">📨 {{ seq.name }}</div>
                  <div v-if="seq.description" class="desc">{{ seq.description }}</div>
                  <div class="stats">⏱ {{ seq.stepCount }} bước</div>
                </div>
              </div>
            </div>

            <!-- Nick auto-pin display -->
            <div class="form-group">
              <label>Nick gửi (auto-pin theo cuộc chat hiện tại)</label>
              <div class="nick-display">
                <span class="lock">🔒</span>
                <span class="nick-name">{{ nickName || 'Chưa chọn nick' }}</span>
              </div>
              <div class="help">Tin nhắn sẽ được gửi qua nick này cho KH</div>
            </div>

            <!-- Reason textarea -->
            <div class="form-group">
              <label>
                Lý do bám đuổi
                <span class="req">*</span>
              </label>
              <textarea
                v-model="reason"
                placeholder="VD: KH có nhu cầu đầu tư đất nền Q2, sales đã gọi 2 lần hứa gửi bảng giá nhưng chưa kịp..."
                rows="3"
              />
              <div class="help">Bắt buộc nhập để admin có thể audit lý do enroll thủ công</div>
            </div>

            <!-- Info box -->
            <div class="alert info">
              ℹ️ <strong>KH sẽ thêm vào Mục tiêu hệ thống "Bám đuổi khách hàng thủ công"</strong>
              <ul>
                <li>Giờ hoạt động: 06:00 - 22:00 (giờ Việt Nam)</li>
                <li>Tự dừng khi KH reply / react tiêu cực</li>
                <li>KHÔNG tính vào KPI Mục tiêu thường (filter mặc định)</li>
              </ul>
            </div>

            <!-- Error -->
            <div v-if="error" class="alert error">⚠️ {{ error }}</div>
          </template>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button class="btn" :disabled="submitting" @click="onClose">Huỷ</button>
          <button
            class="btn btn-primary"
            :disabled="!canSubmit || submitting"
            @click="onSubmit"
          >
            {{ submitting ? 'Đang gửi...' : submitButtonText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api/index';

// ── Props ──
const props = defineProps<{
  contactId: string;
  contactName: string;
  nickId: string;
  nickName: string;
}>();

const emit = defineEmits<{
  close: [];
  enrolled: [payload: { sequenceId: string; sequenceName: string }];
}>();

// ── Types ──
interface SequenceOption {
  id: string;
  name: string;
  description?: string | null;
  stepCount: number;
}

// ── State ──
const sequences = ref<SequenceOption[]>([]);
const loadingSequences = ref(true);
const selectedSequenceId = ref<string | null>(null);
const reason = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

// ── Computed ──
const canSubmit = computed(
  () => !!selectedSequenceId.value && !!props.nickId && reason.value.trim().length > 0,
);

const submitButtonText = computed(() => {
  if (!selectedSequenceId.value) return 'Chọn Sequence';
  const seq = sequences.value.find((s) => s.id === selectedSequenceId.value);
  if (!seq) return 'Bắt đầu bám đuổi';
  return `Bắt đầu bám đuổi ${seq.stepCount} bước`;
});

// ── Fetch sequences ──
async function fetchSequences(): Promise<void> {
  loadingSequences.value = true;
  try {
    const res = await api.get<{
      sequences: Array<{
        id: string;
        name: string;
        description?: string | null;
        steps: unknown[];
        enabled: boolean;
      }>;
    }>('/api/v1/automation/sequences?enabled=true');

    sequences.value = (res.data.sequences ?? [])
      .filter((s) => s.enabled)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        stepCount: Array.isArray(s.steps) ? s.steps.length : 0,
      }));

    // Auto-select sequence đầu tiên
    if (sequences.value.length > 0 && !selectedSequenceId.value) {
      selectedSequenceId.value = sequences.value[0].id;
    }
  } catch (err) {
    console.error('[add-flow-modal] fetch sequences failed', err);
    error.value = 'Lỗi tải danh sách Sequence. Vui lòng thử lại.';
  } finally {
    loadingSequences.value = false;
  }
}

// ── Submit ──
async function onSubmit(): Promise<void> {
  if (!canSubmit.value || submitting.value) return;

  submitting.value = true;
  error.value = null;

  try {
    await api.post(`/api/v1/chat/contacts/${props.contactId}/manual-enroll`, {
      sequenceId: selectedSequenceId.value,
      nickId: props.nickId,
      reason: reason.value.trim(),
    });

    const seq = sequences.value.find((s) => s.id === selectedSequenceId.value);
    emit('enrolled', {
      sequenceId: selectedSequenceId.value!,
      sequenceName: seq?.name ?? '',
    });
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
    error.value = msg || 'Lỗi enroll KH vào Sequence. Vui lòng thử lại.';
    console.error('[add-flow-modal] enroll failed', err);
  } finally {
    submitting.value = false;
  }
}

// ── Close ──
function onClose(): void {
  if (submitting.value) return;
  emit('close');
}

// ── Lifecycle ──
onMounted(() => {
  void fetchSequences();
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(9, 30, 66, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fade-in 0.15s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: white;
  border-radius: 8px;
  width: 540px;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(9, 30, 66, 0.2);
  animation: slide-up 0.2s ease;
}

@keyframes slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid #dfe1e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.modal-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #172b4d;
}

.modal-close {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: none;
  background: #f4f5f7;
  color: #6b778c;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  font-family: inherit;
}

.modal-close:hover {
  background: #dfe1e6;
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid #dfe1e6;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* Loading */
.loading {
  text-align: center;
  padding: 32px;
  color: #6b778c;
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

.empty-seq {
  text-align: center;
  padding: 24px;
  color: #6b778c;
  font-size: 12px;
}
.empty-seq a {
  color: #0068ff;
  text-decoration: none;
  font-weight: 500;
  margin-top: 6px;
  display: block;
}

/* Form */
.form-group {
  margin-bottom: 14px;
}
.form-group label {
  font-weight: 500;
  font-size: 12px;
  margin-bottom: 4px;
  display: block;
  color: #172b4d;
}
.form-group label .req {
  color: #de350b;
}
.form-group .help {
  font-size: 11px;
  color: #6b778c;
  margin-top: 2px;
}

.sequence-radio {
  border: 1px solid #dfe1e6;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 6px;
  cursor: pointer;
  display: flex;
  align-items: start;
  gap: 8px;
  transition: 0.15s;
}
.sequence-radio:hover {
  background: #ebf3ff;
}
.sequence-radio.selected {
  border-color: #0068ff;
  background: #deebff;
}
.sequence-radio input {
  margin-top: 3px;
  cursor: pointer;
}
.sequence-radio .info {
  flex: 1;
}
.sequence-radio .info .name {
  font-weight: 600;
  font-size: 13px;
  color: #172b4d;
}
.sequence-radio .info .desc {
  font-size: 11px;
  color: #6b778c;
  margin-top: 2px;
}
.sequence-radio .stats {
  font-size: 11px;
  color: #42526e;
  margin-top: 4px;
}

.nick-display {
  background: #f4f5f7;
  padding: 10px 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.nick-display .lock {
  color: #00875a;
  font-size: 14px;
}
.nick-display .nick-name {
  font-weight: 600;
}

textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #c1c7d0;
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  min-height: 60px;
  resize: vertical;
  box-sizing: border-box;
  color: #172b4d;
}
textarea:focus {
  outline: none;
  border-color: #0068ff;
  box-shadow: 0 0 0 2px #deebff;
}

.alert {
  padding: 10px 12px;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 12px;
  border-left: 3px solid;
}
.alert.info {
  background: #deebff;
  border-left-color: #0068ff;
  color: #42526e;
}
.alert.info strong {
  color: #172b4d;
}
.alert.info ul {
  margin: 4px 0 0 0;
  padding-left: 18px;
  font-size: 11px;
}
.alert.error {
  background: #ffebe6;
  border-left-color: #de350b;
  color: #de350b;
}

/* Buttons */
.btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid #c1c7d0;
  background: white;
  color: #172b4d;
  cursor: pointer;
  font-family: inherit;
  transition: 0.15s;
}
.btn:hover:not(:disabled) {
  background: #ebf3ff;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: #0068ff;
  color: white;
  border-color: #0068ff;
}
.btn-primary:hover:not(:disabled) {
  background: #0747a6;
}
</style>
