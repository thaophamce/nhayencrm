<template>
  <section class="ai-follow-up-panel">
    <div v-if="loading" class="panel-state">Đang tạo đề xuất mẫu…</div>
    <div v-else-if="!suggestion" class="panel-state">
      <p>Chưa có đề xuất cho hội thoại này.</p>
      <button class="primary-button" type="button" @click="createSuggestion">Tạo đề xuất</button>
    </div>
    <template v-else>
      <div class="suggestion-heading">
        <span class="time-badge">{{ suggestion.timeLabel }}</span>
        <span class="status-badge" :class="`status-${suggestion.status.toLowerCase()}`">{{ statusLabel }}</span>
      </div>

      <div v-if="suggestion.status === 'STALE'" class="stale-warning" role="alert">
        <v-icon size="17">mdi-alert-circle-outline</v-icon>
        <span>Khách đã gửi tin mới sau khi AI tạo đề xuất. Nội dung cũ không còn hợp lệ và không thể duyệt hoặc sử dụng.</span>
      </div>

      <article class="info-card">
        <label>Tóm tắt nhu cầu</label>
        <p>{{ suggestion.needSummary }}</p>
      </article>
      <article class="info-card">
        <label>Lý do AI đề xuất</label>
        <p>{{ suggestion.reason }}</p>
      </article>

      <label class="message-label" for="ai-follow-up-content">Nội dung tin nhắn</label>
      <textarea
        id="ai-follow-up-content"
        v-model="draftContent"
        class="message-editor"
        rows="7"
        :disabled="isLocked"
      />
      <small class="editor-hint">Có thể sửa trước khi duyệt. Bấm Duyệt sẽ gửi tin ngay.</small>

      <div class="action-grid">
        <button type="button" class="secondary-button danger" :disabled="isLocked" @click="discard">Bỏ đề xuất</button>
        <button type="button" class="secondary-button" :disabled="loading" @click="regenerate">Tạo lại</button>
        <button type="button" class="secondary-button" :disabled="isLocked || !hasChanges" @click="save">Lưu bản sửa</button>
        <button type="button" class="primary-button" :disabled="!canApprove || sending" @click="approveSuggestion">{{ sending ? 'Đang gửi…' : 'Duyệt' }}</button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { canApproveAiFollowUp, useAiFollowUp } from '@/composables/use-ai-follow-up';

const emit = defineEmits<{
  send: [content: string, onSuccess: () => void, onError: () => void];
}>();

const props = defineProps<{
  conversationId: string;
  contactId: string;
  contactName?: string | null;
  lastInboundAt?: string | null;
  lastInboundPreview?: string | null;
}>();

const followUp = useAiFollowUp();
const suggestion = computed(() => followUp.suggestions[props.conversationId]);
const draftContent = ref('');
const loading = ref(false);
const sending = ref(false);

const context = computed(() => ({
  conversationId: props.conversationId,
  contactId: props.contactId,
  contactName: props.contactName,
  lastInboundAt: props.lastInboundAt,
  lastInboundPreview: props.lastInboundPreview,
}));
const isLocked = computed(() => ['STALE', 'REJECTED', 'USED', 'SENT'].includes(suggestion.value?.status || ''));
const hasChanges = computed(() => !!suggestion.value && draftContent.value.trim() !== suggestion.value.content);
const canApprove = computed(() => canApproveAiFollowUp(suggestion.value) && !!draftContent.value.trim());
const statusLabel = computed(() => ({
  DRAFT: 'Bản nháp',
  PENDING_REVIEW: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã bỏ',
  USED: 'Đã dùng',
  SENT: 'Đã gửi',
  STALE: 'Không còn hợp lệ',
}[suggestion.value?.status || 'DRAFT']));

watch(suggestion, value => { draftContent.value = value?.content || ''; }, { immediate: true });
watch(() => props.lastInboundAt, value => { if (value) followUp.markStale(props.conversationId, value); }, { immediate: true });

async function createSuggestion(): Promise<void> {
  loading.value = true;
  try { await followUp.generate(context.value); } finally { loading.value = false; }
}
async function regenerate(): Promise<void> {
  loading.value = true;
  try { await followUp.regenerate(context.value); } finally { loading.value = false; }
}
function save(): void { followUp.saveDraft(props.conversationId, draftContent.value); }
function approveSuggestion(): void {
  const content = draftContent.value.trim();
  if (!canApprove.value || sending.value || !content) return;
  if (hasChanges.value) followUp.saveDraft(props.conversationId, content);
  sending.value = true;
  emit(
    'send',
    content,
    () => {
      followUp.markSent(props.conversationId);
      sending.value = false;
    },
    () => { sending.value = false; },
  );
}
function discard(): void { followUp.reject(props.conversationId); }

void createSuggestion();
</script>

<style scoped>
.ai-follow-up-panel { padding: 12px; overflow-y: auto; color: var(--smax-grey-900, #172033); }
.panel-state { padding: 28px 12px; text-align: center; color: var(--smax-grey-600, #64748b); }
.suggestion-heading { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 10px; }
.time-badge, .status-badge { display: inline-flex; align-items: center; min-height: 25px; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.time-badge { background: #eaf4ff; color: #0866c6; }
.status-badge { background: #fff7df; color: #925f00; }
.status-approved { background: #e9f8ef; color: #18794e; }
.status-stale, .status-rejected { background: #fff0f0; color: #b42318; }
.stale-warning { display: flex; gap: 7px; padding: 9px; margin-bottom: 10px; border: 1px solid #f7b8b3; border-radius: 7px; background: #fff5f4; color: #9f251b; font-size: 12px; line-height: 1.4; }
.info-card { padding: 10px; margin-bottom: 8px; border: 1px solid var(--smax-grey-200, #e2e8f0); border-radius: 7px; background: #fff; }
.info-card label, .message-label { display: block; margin-bottom: 5px; color: var(--smax-grey-600, #64748b); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.info-card p { margin: 0; font-size: 12.5px; line-height: 1.5; }
.message-editor { width: 100%; resize: vertical; padding: 10px; border: 1px solid var(--smax-grey-300, #cbd5e1); border-radius: 7px; background: #fff; color: inherit; font: inherit; font-size: 13px; line-height: 1.5; outline: none; }
.message-editor:focus { border-color: #1687e8; box-shadow: 0 0 0 2px rgb(22 135 232 / 12%); }
.message-editor:disabled { background: #f8fafc; color: #64748b; }
.editor-hint { display: block; margin: 5px 0 11px; color: #64748b; font-size: 11px; }
.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.action-grid button { min-height: 34px; padding: 7px 9px; border-radius: 7px; cursor: pointer; font-size: 12px; font-weight: 650; }
.secondary-button { border: 1px solid #d5dce5; background: #fff; color: #334155; }
.secondary-button.danger { color: #b42318; }
.primary-button { border: 1px solid #0878d1; background: #0878d1; color: #fff; }
button:disabled { cursor: not-allowed; opacity: .48; }
@media (max-width: 300px) { .action-grid { grid-template-columns: 1fr; } }
</style>
