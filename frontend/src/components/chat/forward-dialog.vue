<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="fw-card">
      <!-- Header -->
      <header class="fw-head">
        <div class="fw-head__title">
          <svg class="fw-head__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>
          </svg>
          <span>Chuyển tiếp tin nhắn</span>
        </div>
        <button class="fw-head__close" aria-label="Đóng" @click="emit('update:modelValue', false)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <!-- Source nick badge -->
      <div v-if="sourceNickLabel" class="fw-nick-row">
        Từ nick <span class="fw-nick-pill">{{ sourceNickLabel }}</span>
      </div>

      <!-- Search -->
      <div class="fw-search-wrap">
        <svg class="fw-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="query"
          class="fw-search-input"
          placeholder="Tìm bạn bè, nhóm trong nick này..."
        />
      </div>

      <!-- Bộ lọc nhãn Zalo (giống popup thêm thành viên) -->
      <div v-if="availableTags.length" class="fw-tags-wrap">
        <button v-show="canScrollTagsLeft" type="button" class="fw-tag-arrow left" aria-label="Xem nhãn bên trái" @click="scrollTags(-1)">&#8249;</button>
        <div ref="tagsScroller" class="fw-tags" @scroll.passive="updateTagScrollState">
          <button :class="{ active: !activeTag }" @click="selectNativeTag('')">Tất cả</button>
          <button
            v-for="tag in availableTags"
            :key="tag.key"
            class="fw-native-tag"
            :class="{ active: activeTag === tag.key }"
            :style="{ '--tag-color': tag.color }"
            :title="`${tag.assignedCount} bạn đang có nhãn này`"
            @click="selectNativeTag(tag.key)"
          ><span class="fw-tag-dot" />{{ tag.name }}<small>{{ tag.assignedCount }}</small></button>
        </div>
        <button v-show="canScrollTagsRight" type="button" class="fw-tag-arrow right" aria-label="Xem nhãn bên phải" @click="scrollTags(1)">&#8250;</button>
      </div>

      <!-- List -->
      <div class="fw-list">
        <div v-if="loadingConversations" class="fw-empty">&#272;ang t&#7843;i h&#7897;i tho&#7841;i...</div>
        <button
          v-for="conv in loadingConversations ? [] : filtered"
          :key="conv.id"
          type="button"
          class="fw-item"
          :class="{ 'is-selected': selectedSet.has(conv.id) }"
          @click="toggleSelect(conv.id)"
        >
          <!-- Checkbox (visual only — entire row triggers toggle) -->
          <span class="fw-check" :class="{ 'is-checked': selectedSet.has(conv.id) }">
            <svg v-if="selectedSet.has(conv.id)" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>

          <!-- Avatar -->
          <span class="fw-avatar" :style="avatarStyle(conv)">
            <img v-if="avatarUrl(conv)" :src="avatarUrl(conv)!" alt="" @error="onAvatarError(conv.id)" />
            <span v-else class="fw-avatar__fallback">{{ avatarInitial(conv) }}</span>
          </span>

          <!-- Body: name + last preview -->
          <span class="fw-body">
            <span class="fw-name">
              {{ displayName(conv) }}
              <span v-if="conv.threadType === 'group'" class="fw-group-chip">Nhóm</span>
            </span>
            <span class="fw-meta">
              <span v-if="conv.lastMessageAt" class="fw-time">{{ formatRelativeTime(conv.lastMessageAt, now) }}</span>
            </span>
          </span>
        </button>

        <div v-if="!loadingConversations && filtered.length === 0" class="fw-empty">
          <div class="fw-empty__icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <div>{{ query ? 'Không tìm thấy hội thoại khớp.' : 'Nick này chưa có hội thoại khác.' }}</div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="fw-foot">
        <span class="fw-foot__count">
          {{ selectedSet.size > 0 ? `Đã chọn ${selectedSet.size}` : 'Chưa chọn' }}
        </span>
        <div class="fw-foot__actions">
          <button class="fw-btn fw-btn--ghost" @click="emit('update:modelValue', false)">Huỷ</button>
          <button
            class="fw-btn fw-btn--primary"
            :disabled="selectedSet.size === 0"
            @click="onForward"
          >
            Chuyển tiếp
          </button>
        </div>
      </footer>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { api } from '@/api';

interface ConvShape {
  id: string;
  threadType: string;
  contact?: { fullName?: string | null; crmName?: string | null; avatarUrl?: string | null } | null;
  friendship?: { aliasInNick?: string | null; zaloDisplayName?: string | null; zaloAvatarUrl?: string | null; zaloLabels?: Array<{ id?: string | number; name?: string; color?: string }> | null } | null;
  zaloAccount?: { id: string; displayName?: string | null } | null;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  lastMessageAt?: string | null;
}

const props = defineProps<{
  modelValue: boolean;
  conversations: ConvShape[];
  /** ID nick Zalo nguồn — filter chỉ hiện hội thoại của nick này. */
  sourceZaloAccountId?: string | null;
  /** Tên nick Zalo nguồn — hiển thị trên badge "Từ nick X". */
  sourceNickLabel?: string | null;
  /** Loại ID hội thoại nguồn (không cho forward về chính nó). */
  currentConversationId?: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  forward: [targetIds: string[]];
}>();

const query = ref('');
const selectedSet = ref(new Set<string>());
const brokenAvatars = ref(new Set<string>());
const activeTag = ref('');
const pickerConversations = ref<ConvShape[]>([]);
const loadingConversations = ref(false);
const pickerLoadFailed = ref(false);

const tagsScroller = ref<HTMLElement | null>(null);
const canScrollTagsLeft = ref(false);
const canScrollTagsRight = ref(false);

type NativeLabel = { key: string; id: number; name: string; color: string; assignedCount: number; offset: number };
const nativeLabels = ref<NativeLabel[]>([]);
const availableTags = computed(() => nativeLabels.value);

// Reset selection mỗi lần dialog mở (tránh dirty state cross-session)
watch(() => props.modelValue, (open) => {
  if (open) {
    selectedSet.value = new Set();
    query.value = '';
    activeTag.value = '';
    brokenAvatars.value = new Set();
    void Promise.all([loadNativeLabels(), loadConversations()]);
  }
}, { immediate: true });

watch(() => props.sourceZaloAccountId, () => {
  if (props.modelValue) void Promise.all([loadNativeLabels(), loadConversations()]);
});

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, () => {
  if (!props.modelValue) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadConversations, 250);
});

function normalizeTagColor(value: unknown): string {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  if (/^rgb(a)?\(/i.test(raw)) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return `#${(numeric & 0xffffff).toString(16).padStart(6, '0')}`;
  return '#4DA3FF';
}

async function loadNativeLabels() {
  if (!props.sourceZaloAccountId) { nativeLabels.value = []; return; }
  try {
    const { data } = await api.get(`/zalo-accounts/${props.sourceZaloAccountId}/labels`);
    nativeLabels.value = (data.labels || []).map((label: any) => ({
      key: `zalo:${String(label.id)}`,
      id: Number(label.id),
      name: String(label.text || 'Nhãn Zalo'),
      color: normalizeTagColor(label.color),
      assignedCount: Number(label.assignedCount || 0),
      offset: Number(label.offset || 0),
    })).sort((a: NativeLabel, b: NativeLabel) => a.offset - b.offset);
    await nextTick();
    updateTagScrollState();
  } catch { nativeLabels.value = []; }
}

function updateTagScrollState() {
  const el = tagsScroller.value;
  if (!el) { canScrollTagsLeft.value = false; canScrollTagsRight.value = false; return; }
  canScrollTagsLeft.value = el.scrollLeft > 2;
  canScrollTagsRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
}

function scrollTags(direction: -1 | 1) {
  const el = tagsScroller.value;
  if (!el) return;
  el.scrollBy({ left: direction * Math.max(180, el.clientWidth * 0.7), behavior: 'smooth' });
  window.setTimeout(updateTagScrollState, 350);
}

function selectedNativeLabelId(): number | undefined {
  if (!activeTag.value.startsWith('zalo:')) return undefined;
  const id = Number(activeTag.value.slice(5));
  return Number.isInteger(id) ? id : undefined;
}

function selectNativeTag(key: string) {
  activeTag.value = !key || activeTag.value === key ? '' : key;
  void loadConversations();
}

// Scope: chỉ giữ conv của cùng nick + loại bỏ conv hiện tại + sort recent
function localFallbackConversations(): ConvShape[] {
  const q = query.value.trim().toLocaleLowerCase('vi');
  const labelId = selectedNativeLabelId();
  return props.conversations
    .filter((conv) => {
      if (props.sourceZaloAccountId && conv.zaloAccount?.id !== props.sourceZaloAccountId) return false;
      if (props.currentConversationId && conv.id === props.currentConversationId) return false;
      if (labelId != null && !conv.friendship?.zaloLabels?.some((label) => Number(label.id) === labelId)) return false;
      if (!q) return true;
      return [conv.groupName, conv.contact?.crmName, conv.contact?.fullName, conv.friendship?.aliasInNick, conv.friendship?.zaloDisplayName]
        .some((value) => value?.toLocaleLowerCase('vi').includes(q));
    })
    .sort((a, b) => {
      const left = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const right = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return right - left;
    });
}

const scoped = computed(() => pickerConversations.value);
const filtered = computed(() => scoped.value);

let conversationRequestId = 0;
async function loadConversations() {
  const fallback = localFallbackConversations();
  // Hi?n d? li?u sidebar ngay, kh?ng ?? popup tr?ng trong l?c ch? API.
  pickerConversations.value = fallback;
  pickerLoadFailed.value = false;
  if (!props.sourceZaloAccountId) return;

  const requestId = ++conversationRequestId;
  loadingConversations.value = fallback.length === 0;
  try {
    const { data } = await api.get('/conversations/picker', {
      params: {
        accountId: props.sourceZaloAccountId,
        search: query.value,
        limit: 80,
        zaloLabelId: selectedNativeLabelId(),
        excludeId: props.currentConversationId || undefined,
      },
    });
    if (requestId !== conversationRequestId) return;
    const remote = Array.isArray(data.conversations) ? data.conversations : [];
    // Backend r?ng nh?ng sidebar c? h?i tho?i: gi? fallback ?? user v?n ch?n ???c.
    pickerConversations.value = remote.length > 0 ? remote : fallback;
  } catch (error) {
    if (requestId === conversationRequestId) {
      pickerLoadFailed.value = true;
      pickerConversations.value = fallback;
      console.error('[forward-dialog] load conversations failed', error);
    }
  } finally {
    if (requestId === conversationRequestId) loadingConversations.value = false;
  }
}

function isUsable(s: string | null | undefined): s is string {
  return !!s && s.trim().length > 0 && s.trim().toLowerCase() !== 'unknown';
}

function displayName(conv: ConvShape): string {
  if (conv.threadType === 'group' && isUsable(conv.groupName)) return conv.groupName!;
  if (isUsable(conv.contact?.crmName)) return conv.contact!.crmName!;
  if (isUsable(conv.contact?.fullName)) return conv.contact!.fullName!;
  if (isUsable(conv.friendship?.aliasInNick)) return conv.friendship!.aliasInNick!;
  if (isUsable(conv.friendship?.zaloDisplayName)) return conv.friendship!.zaloDisplayName!;
  return conv.threadType === 'group' ? 'Nhóm' : 'Không rõ';
}

function avatarUrl(conv: ConvShape): string | null {
  if (brokenAvatars.value.has(conv.id)) return null;
  if (conv.threadType === 'group') return conv.groupAvatarUrl ?? null;
  return conv.contact?.avatarUrl ?? conv.friendship?.zaloAvatarUrl ?? null;
}

function onAvatarError(convId: string) {
  brokenAvatars.value.add(convId);
}

function avatarInitial(conv: ConvShape): string {
  const name = displayName(conv);
  const first = name.trim().charAt(0).toUpperCase();
  return first || '?';
}

function avatarStyle(conv: ConvShape) {
  // Gradient seed theo conv.id để cùng KH luôn cùng màu
  const hash = Array.from(conv.id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hue = hash % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue}, 60%, 60%), hsl(${(hue + 40) % 360}, 60%, 50%))`,
  };
}

function toggleSelect(id: string) {
  const next = new Set(selectedSet.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedSet.value = next;
}

function onForward() {
  if (selectedSet.value.size === 0) return;
  emit('forward', Array.from(selectedSet.value));
  emit('update:modelValue', false);
}

// Live "now" ticker (2026-06-11) — cùng cơ chế ConversationList: ref `now` cập
// nhật mỗi 30s, truyền vào formatRelativeTime làm dependency reactive để thời
// gian tự nhảy khi để dialog mở yên (trước đây đứng yên vì lastMessageAt static).
const now = ref(Date.now());
let nowTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { nowTimer = setInterval(() => { now.value = Date.now(); }, 30000); });
onUnmounted(() => { if (nowTimer) { clearInterval(nowTimer); nowTimer = null; } });

// Relative time format — VN-friendly. _tick chỉ để tạo dependency reactive.
function formatRelativeTime(iso: string, _tick: number = now.value): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = _tick - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Now';
  if (min < 60) return `${min}p`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}n`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}
</script>

<style scoped>
.fw-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  font-family: inherit;
}

/* Header */
.fw-head {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #eef0f3;
}
.fw-head__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  flex: 1;
}
.fw-head__icon { width: 18px; height: 18px; color: #2962ff; }
.fw-head__close {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: 0; cursor: pointer;
  border-radius: 6px;
  color: #6b7280;
  transition: background 0.1s;
}
.fw-head__close:hover { background: #f3f4f6; color: #1f2937; }

/* Nick badge row */
.fw-nick-row {
  font-size: 12px;
  color: #6b7280;
  padding: 10px 16px 0;
}
.fw-nick-pill {
  display: inline-block;
  background: rgba(41, 98, 255, 0.08);
  color: #2962ff;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  margin-left: 4px;
}

/* Search */
.fw-search-wrap {
  position: relative;
  padding: 12px 16px 8px;
}
.fw-search-icon {
  position: absolute;
  left: 28px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px; height: 16px;
  color: #9ca3af;
  pointer-events: none;
}
.fw-search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13.5px;
  font-family: inherit;
  background: #f9fafb;
  outline: none;
  color: #1f2937;
  transition: border-color 0.12s, background 0.12s;
}
.fw-search-input:focus {
  border-color: #2962ff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(41, 98, 255, 0.12);
}

/* Bộ lọc nhãn Zalo */
.fw-tags-wrap { position: relative; padding: 0 16px 8px; }
.fw-tags { display: flex; gap: 7px; overflow-x: auto; padding-right: 28px; scroll-behavior: smooth; scrollbar-width: none; }
.fw-tags::-webkit-scrollbar { display: none; }
.fw-tag-arrow { position: absolute; z-index: 2; top: calc(50% - 4px); transform: translateY(-50%); width: 26px; height: 28px; padding: 0; border: 1px solid #e5e7eb; border-radius: 50%; background: #fff; color: #2962ff; box-shadow: 0 2px 8px rgba(30,32,44,.16); font: 700 20px/24px Arial, sans-serif; cursor: pointer; }
.fw-tag-arrow:hover { background: rgba(41, 98, 255, 0.08); }
.fw-tag-arrow.left { left: 9px; }
.fw-tag-arrow.right { right: 9px; }
.fw-tags button { border: 1px solid transparent; border-radius: 999px; background: #f3f4f6; color: #6b7280; padding: 5px 12px; white-space: nowrap; font: 600 11px/1.2 inherit; cursor: pointer; }
.fw-tags button:hover { border-color: #c7d2fe; color: #2962ff; }
.fw-tags button.active { background: #2962ff; color: #fff; }
.fw-tags .fw-native-tag { display: inline-flex; align-items: center; gap: 6px; }
.fw-native-tag small { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; display: inline-grid; place-items: center; background: rgba(95,97,115,.12); color: inherit; font: 700 9px/1 inherit; }
.fw-native-tag.active small { background: rgba(255,255,255,.22); }
.fw-tag-dot { width: 11px; height: 11px; border-radius: 50%; flex: 0 0 auto; background: var(--tag-color, #4DA3FF); box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); }
.fw-tags .fw-native-tag.active .fw-tag-dot { box-shadow: 0 0 0 2px rgba(255,255,255,.7), inset 0 0 0 1px rgba(0,0,0,.15); }

/* List */
.fw-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
  min-height: 280px;
  max-height: 380px;
}
.fw-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.08s;
  margin-bottom: 2px;
}
.fw-item:hover { background: #f3f4f6; }
.fw-item.is-selected { background: rgba(41, 98, 255, 0.08); }
.fw-item.is-selected:hover { background: rgba(41, 98, 255, 0.14); }
.fw-item:focus-visible { outline: 2px solid #2962ff; outline-offset: 1px; }

.fw-check {
  width: 20px; height: 20px;
  flex-shrink: 0;
  border: 2px solid #d1d5db;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, border-color 0.12s;
}
.fw-check.is-checked {
  background: #2962ff;
  border-color: #2962ff;
}

.fw-avatar {
  width: 38px; height: 38px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 600;
  position: relative;
}
.fw-avatar img {
  width: 100%; height: 100%;
  object-fit: cover;
}
.fw-avatar__fallback {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

.fw-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fw-name {
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}
.fw-group-chip {
  display: inline-block;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  letter-spacing: 0.3px;
}
.fw-meta {
  font-size: 11.5px;
  color: #9ca3af;
}
.fw-time { font-variant-numeric: tabular-nums; }

/* Empty state */
.fw-empty {
  text-align: center;
  padding: 28px 16px;
  color: #9ca3af;
  font-size: 13px;
}
.fw-empty__icon {
  display: inline-flex;
  width: 48px; height: 48px;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 50%;
  margin-bottom: 8px;
}

/* Footer */
.fw-foot {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid #eef0f3;
  gap: 12px;
}
.fw-foot__count {
  font-size: 12.5px;
  color: #6b7280;
  flex: 1;
}
.fw-foot__actions { display: flex; gap: 8px; }
.fw-btn {
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s, opacity 0.1s;
}
.fw-btn--ghost {
  background: transparent;
  color: #6b7280;
}
.fw-btn--ghost:hover { background: #f3f4f6; color: #1f2937; }
.fw-btn--primary {
  background: #2962ff;
  color: #fff;
}
.fw-btn--primary:hover { background: #1d4ed8; }
.fw-btn--primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
