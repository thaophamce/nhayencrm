<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="cfb">
    <Transition name="cfb-expand">
      <div v-show="expanded" class="cfb-advanced">
    <!-- ① Quick pills row — soft button, no icon, count fixed-slot tránh nhảy UI -->
    <div class="cfb-pills-wrap">
      <div class="cfb-pills">
        <button
          class="pill alert"
          :class="{ active: filters.state.quickPills.has('unread') }"
          @click="filters.toggleQuickPill('unread')"
        >
          <span class="pill-label">Chưa đọc</span>
          <span class="count">{{ counts.unread ?? 0 }}</span>
        </button>
        <button
          class="pill warning"
          :class="{ active: filters.state.quickPills.has('unanswered') }"
          @click="filters.toggleQuickPill('unanswered')"
        >
          <span class="pill-label">Chưa rep</span>
          <span class="count">{{ counts.unanswered ?? 0 }}</span>
        </button>
        <button
          class="pill danger"
          :class="{ active: filters.state.quickPills.has('stuck') }"
          @click="filters.toggleQuickPill('stuck')"
        >
          <span class="pill-label">Đình trệ</span>
          <span class="count">{{ counts.stuck ?? 0 }}</span>
        </button>
        <button
          class="pill success"
          :class="{ active: filters.state.quickPills.has('ready') }"
          @click="filters.toggleQuickPill('ready')"
        >
          <span class="pill-label">Sẵn sàng</span>
          <span class="count">{{ counts.ready ?? 0 }}</span>
        </button>
      </div>
    </div>

    <!-- ①b Nhãn ngày im (MVP phân loại hội thoại 2026-07-19) — lọc theo silenceLabel.
         Emoji ngược trực giác: 🔥 mới im (đuổi gấp) → ❄️ im lâu (gần mất). -->
    <div class="cfb-silence-wrap">
      <div class="cfb-silence">
        <button
          v-for="s in SILENCE_LABELS"
          :key="s.key"
          class="silence-pill"
          :class="{ active: filters.state.silenceLabels.has(s.key) }"
          @click="filters.toggleSilenceLabel(s.key)"
          :title="s.tooltip"
        >
          <span class="silence-emoji">{{ s.emoji }}</span>
          <span class="silence-label">{{ s.label }}</span>
        </button>
      </div>
    </div>

    <!-- ② 4 tabs row — Main Tab style, chia 4 equal, KHÔNG icon KHÔNG count.
         User spec: "Đây dạng Main Tab — fix size không cần đếm số hội thoại". -->
    <div class="cfb-tabs main-tab-style">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="cfb-tab"
        :class="{
          active: filters.state.activeTab === tab.key,
          'has-unread': tab.key === 'other' && priorityHasUnread,
        }"
        @click="setActiveTab(tab.key)"
        :title="tab.tooltip"
      >
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>
      </div>
    </Transition>

    <!-- ③ Mini counter + sort row — half height, muted -->
    <div class="cfb-mini">
      <span class="mini-count">
        <strong>{{ totalCount }}</strong> hội thoại
        <template v-if="counts.unread">
          <span class="dot">·</span>
          <span class="accent">{{ counts.unread }} chưa đọc</span>
        </template>
      </span>
      <div class="mini-sorts">
        <select v-model="filters.state.sortMode" class="mini-sort" aria-label="Ưu tiên hội thoại">
          <option value="unread-first">Chưa đọc lên trên</option>
          <option value="recent">Không ưu tiên chưa đọc</option>
        </select>
        <select v-model="filters.state.timeOrder" class="mini-sort time-sort" aria-label="Thứ tự thời gian">
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  filters: any;
  totalCount: number;
  counts: {
    unread?: number;
    unanswered?: number;
    stuck?: number;
    ready?: number;
    individual?: number;
    group?: number;
    main?: number;
    other?: number;
  };
  /** 2026-06-11 — tab Ưu tiên KHÔNG hiện số đếm, nhưng IN ĐẬM hơn khi có hội thoại
   *  chưa đọc trong tab này. Đọc hết → hết đậm. ChatView truyền cờ này xuống. */
  priorityHasUnread?: boolean;
  expanded?: boolean;
}>();

// 2026-06-20: phát khi click LẠI tab đang active → ChatView clear ô tìm kiếm.
const emit = defineEmits<{ 'reselect-tab': [] }>();

type TabKey = 'all' | 'personal' | 'group' | 'main' | 'other';
type SilenceKey = 'hot' | 'warm' | 'cool' | 'cold';

// MVP phân loại hội thoại (2026-07-19) — emoji ngược trực giác: 🔥 mới im → ❄️ im lâu.
const SILENCE_LABELS: Array<{
  key: SilenceKey;
  emoji: string;
  label: string;
  tooltip: string;
}> = [
  { key: 'hot',  emoji: '🔥', label: '4–6n',  tooltip: 'Im 4–6 ngày — đuổi gấp kẻo nguội' },
  { key: 'warm', emoji: '☀️', label: '7–14n', tooltip: 'Im 7–14 ngày' },
  { key: 'cool', emoji: '🌤️', label: '15–29n', tooltip: 'Im 15–29 ngày' },
  { key: 'cold', emoji: '❄️', label: '30n+',  tooltip: 'Im từ 30 ngày — gần mất, cần cứu' },
];

const TABS: Array<{
  key: TabKey;
  label: string;
  tooltip: string;
}> = [
  { key: 'all',      label: 'Tất cả',  tooltip: 'Xem toàn bộ hội thoại không phân biệt' },
  { key: 'personal', label: 'Cá nhân', tooltip: 'Chỉ hội thoại 1-1 (user với user)' },
  { key: 'group',    label: 'Nhóm',    tooltip: 'Chỉ hội thoại nhóm' },
  { key: 'main',     label: 'Chính',   tooltip: 'Hộp thư chính (cả user lẫn nhóm)' },
  { key: 'other',    label: 'Ưu tiên', tooltip: 'Hộp thư ưu tiên' }
];

function setActiveTab(key: TabKey) {
  // 2026-06-20 (anh báo): click LẠI tab đang active cũng phải clear ô tìm kiếm. activeTab
  // không đổi → watch ở ChatView không fire → emit 'reselect-tab' để parent tự clear search.
  const sameTab = props.filters.state.activeTab === key;
  // Single-active: tab khác sẽ tự deselect.
  props.filters.state.activeTab = key;
  if (sameTab) emit('reselect-tab');
}

</script>

<style scoped>
.cfb {
  background: white;
  border-bottom: 1px solid #F3F4F6;
  flex-shrink: 0;
}
.cfb-advanced {
  overflow: hidden;
}
.cfb-expand-enter-active,
.cfb-expand-leave-active {
  max-height: 190px;
  transition: max-height 180ms ease, opacity 150ms ease;
}
.cfb-expand-enter-from,
.cfb-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

/* ① Quick pills — 4 pills chia ĐỀU, vừa khít khung cột 2, KHÔNG scroll ngang */
.cfb-pills-wrap {
  border-bottom: 1px solid #F3F4F6;
}
.cfb-pills {
  display: flex;
  gap: 4px;
  padding: 7px 10px;
  align-items: center;
}

/* Pill: 2-line layout (label trên, count dưới) — fit gọn trong ~76px/pill
   Cách này tránh ellipsis label "Chưa đọc" → "Ch..." khi cột 2 hẹp. */
.pill {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 5px 4px 4px;
  border-radius: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  border: 1px solid #E5E7EB;
  background: white;
  color: #4B5563;
  font-family: inherit;
  line-height: 1.2;
}
.pill .pill-label {
  font-size: 10.5px;
  white-space: nowrap;
}
.pill:hover {
  background: #FAFBFC;
  border-color: #D1D5DB;
  color: #111827;
}
.pill .pill-label {
  font-weight: 500;
}

/* Active state: light tint + colored border (no dark solid bg) */
.pill.alert.active {
  background: #FEF2F2;
  border-color: #FCA5A5;
  color: #B91C1C;
  font-weight: 600;
}
.pill.warning.active {
  background: #FFFBEB;
  border-color: #FCD34D;
  color: #B45309;
  font-weight: 600;
}
.pill.danger.active {
  background: #FEF2F2;
  border-color: #F87171;
  color: #B91C1C;
  font-weight: 600;
}
.pill.success.active {
  background: #F0FDF4;
  border-color: #86EFAC;
  color: #047857;
  font-weight: 600;
}

/* Count: fixed slot, monospace tiny, always visible */
/* Count dưới label (2-line layout) — compact, đậm */
.pill .count {
  color: #6B7280;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  transition: color 0.18s ease;
}
/* Active state: count inherit accent color (không cần background — 2-line clean) */
.pill.alert.active .count { color: #B91C1C; }
.pill.warning.active .count { color: #B45309; }
.pill.danger.active .count { color: #B91C1C; }
.pill.success.active .count { color: #047857; }

/* ①b Nhãn ngày im — 4 pill nhỏ emoji, cùng style pill nhưng gọn hơn */
.cfb-silence-wrap {
  border-bottom: 1px solid #F3F4F6;
}
.cfb-silence {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  align-items: center;
}
.silence-pill {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  border: 1px solid #E5E7EB;
  background: white;
  color: #4B5563;
  font-family: inherit;
  line-height: 1.2;
}
.silence-pill .silence-emoji { font-size: 13px; }
.silence-pill .silence-label {
  font-size: 10.5px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.silence-pill:hover {
  background: #FAFBFC;
  border-color: #D1D5DB;
  color: #111827;
}
.silence-pill.active {
  background: #EEF2FF;
  border-color: #A5B4FC;
  color: #4338CA;
  font-weight: 600;
}

/* ② Main Tab style — Segmented Control hiện đại giống Lark/Linear/Attio */
.cfb-tabs.main-tab-style {
  display: flex;
  background: #F3F4F6;
  padding: 4px;
  border-radius: 12px;
  gap: 2px;
  border-bottom: none;
  margin: 10px 12px 2px;
  height: 44px;
  align-items: center;
}
.cfb-tabs.main-tab-style .cfb-tab {
  flex: 1;
  height: 36px;
  padding: 0 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.1px;
  color: #6B7280;
  cursor: pointer;
  border: none;
  background: transparent;
  border-radius: 10px;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-family: inherit;
}
.cfb-tabs.main-tab-style .cfb-tab:hover {
  background: #E5E7EB;
  color: #374151;
}
.cfb-tabs.main-tab-style .cfb-tab.active {
  background: #EBF3FF !important;
  color: #2F80ED !important;
  box-shadow: none;
}
/* 2026-06-11 — tab Ưu tiên có tin chưa đọc: in ĐẬM hơn + đậm màu + chấm báo nhỏ.
   Không hiện con số (theo yêu cầu). Đọc hết → class này biến mất → trở lại thường. */
.cfb-tabs.main-tab-style .cfb-tab.has-unread:not(.active) {
  color: #111827;
  font-weight: 800;
}
.cfb-tabs.main-tab-style .cfb-tab.has-unread .tab-label::after {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 5px;
  border-radius: 50%;
  background: #EF4444;
  vertical-align: middle;
}
.cfb-tab .tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Main-tab: font đã đủ nhỏ để "Ưu tiên" vừa khít → không cắt ellipsis. */
.cfb-tabs.main-tab-style .cfb-tab .tab-label {
  overflow: visible;
  text-overflow: clip;
}
/* Bottom border thay cho tabs section sau khi đổi sang main-tab pill style */
.cfb-tabs.main-tab-style + .cfb-mini {
  margin-top: 8px;
}

/* ④ Mini row — half height, muted */
.cfb-mini {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 14px;
  background: #FAFBFC;
  font-size: 10.5px;
  color: #9CA3AF;
  border-bottom: 1px solid #F3F4F6;
  min-height: 22px;
}
.mini-count strong { color: #4B5563; font-weight: 600; }
.mini-count .dot { margin: 0 4px; color: #D1D5DB; }
.mini-count .accent { color: #EF4444; font-weight: 600; }
.mini-sort {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: #6B7280;
  font-weight: 500;
  font-size: 10.5px;
  font-family: inherit;
  transition: color 0.15s, background 0.15s;
}
.mini-sorts { display: flex; align-items: center; gap: 4px; }
.mini-sort { max-width: 136px; outline: none; }
.mini-sort.time-sort { max-width: 72px; }
.mini-sort:hover { color: #4338CA; background: white; }
.mini-sort .ic { width: 10px; height: 10px; opacity: 0.7; }
</style>
