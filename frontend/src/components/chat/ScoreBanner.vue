<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="score-banner">
    <!-- 2 stat cards row — Priority rộng 15% hơn -->
    <div class="sb-stats">
      <div
        class="sb-card lead"
        @mouseenter="hovered = 'lead'"
        @mouseleave="hovered = null"
      >
        <div class="sb-icon">💰</div>
        <div class="sb-num">{{ leadDisplay }}</div>
        <div class="sb-lbl">Lead</div>
        <div class="sb-trend" :class="leadTrendClass">{{ leadTrendText }}</div>
      </div>

      <div
        class="sb-card priority"
        @mouseenter="hovered = 'priority'"
        @mouseleave="hovered = null"
      >
        <div class="sb-icon">🎯</div>
        <div class="sb-num">{{ priorityDisplay }}</div>
        <div class="sb-lbl">Priority</div>
        <div class="sb-trend" :class="priorityTagClass">{{ priorityTagText }}</div>
      </div>
    </div>

    <!-- Tooltip popover — shared, content swap theo card hover -->
    <div v-if="hovered" class="sb-tooltip" :class="`tt-${hovered}`">
      <div class="tt-arrow"></div>

      <!-- 💰 Lead -->
      <template v-if="hovered === 'lead'">
        <div class="tt-title"><span class="tt-icon">💰</span> Lead Score</div>
        <div class="tt-def">
          <strong>Khả năng KH có ý mua (0-100).</strong> Hệ thống ĐỌC nội dung tin nhắn + hành vi để chấm.
        </div>
        <div class="tt-section">Cách tăng điểm:</div>
        <ul class="tt-list">
          <li>KH gõ keyword "giá / đặt / báo giá / đặt cọc / ship" → <strong>+20</strong> (mạnh nhất)</li>
          <li>KH gửi voice / video call → <strong>+8</strong> mỗi cuộc</li>
          <li>KH phản hồi nhanh &lt; 5 phút → <strong>+5</strong></li>
          <li>KH gửi tin dài &gt; 50 ký tự → <strong>+2</strong> (cap 10/ngày)</li>
          <li>KH gửi tin bất kỳ → <strong>+3</strong> (cap 15/ngày)</li>
          <li>KH thả ❤️ 👍 trên tin sale → <strong>+N</strong></li>
          <li>Sale đặt lịch hẹn cho KH → <strong>stage transition</strong></li>
          <li>Sale gắn tag VIP / Hot lead → <strong>Fit tăng</strong></li>
          <li>Sale chuyển stage cao hơn (Mới → Tiếp cận → Hẹn → Báo giá → Chốt) → <strong>+N</strong></li>
        </ul>
      </template>

      <!-- 🎯 Priority -->
      <template v-else-if="hovered === 'priority'">
        <div class="tt-title"><span class="tt-icon">🎯</span> Priority Score</div>
        <div class="tt-def">
          <strong>Điểm ưu tiên gọi hôm nay (0-100).</strong> Hiện tại = Lead Score.
        </div>
        <div class="tt-section">Cách tăng điểm:</div>
        <ul class="tt-list">
          <li>Mọi hành động tăng Lead (xem tooltip kia)</li>
        </ul>
        <div class="tt-action">
          <strong style="color:#FCA5A5">Cao (&gt;80)</strong> = ưu tiên #1, gọi ngay ·
          <strong>Trung (30-60)</strong> = nuôi đều ·
          <strong style="color:#9CA3AF">Thấp (&lt;30)</strong> = bỏ qua tuần này
        </div>
      </template>
    </div>

    <!-- Avatar + name row -->
    <div class="sb-bottom">
      <slot name="avatar"></slot>
      <div class="sb-name-block">
        <slot name="name"></slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

type ScoreKey = 'lead' | 'priority';
const hovered = ref<ScoreKey | null>(null);

interface ScoreData {
  lead: number | null;
  priority: number | null;
}

const props = defineProps<{
  scores: ScoreData;
}>();

const EMPTY_TAG = '—';

// Display values cho số chính — '0' khi null để layout không nhảy
const leadDisplay = computed(() => props.scores.lead ?? 0);
const priorityDisplay = computed(() => props.scores.priority ?? 0);

const leadTrendText = computed(() => {
  const score = props.scores.lead;
  if (score === null || score === undefined) return EMPTY_TAG;
  if (score >= 80) return '🔥 Hot';
  if (score >= 50) return '🌡 Warm';
  if (score >= 25) return '○ Mild';
  return '❄️ Cold';
});
const leadTrendClass = computed(() => {
  const score = props.scores.lead;
  if (score === null || score === undefined) return 'tag-empty';
  if (score >= 80) return 'tag-hot';
  if (score >= 50) return 'tag-warm';
  return 'tag-cold';
});

const priorityTagText = computed(() => {
  const score = props.scores.priority;
  if (score === null || score === undefined) return EMPTY_TAG;
  if (score >= 80) return '⚡ Top';
  if (score >= 60) return '↑ Cao';
  if (score >= 30) return 'TB';
  return '↓ Thấp';
});
const priorityTagClass = computed(() => {
  const score = props.scores.priority;
  if (score === null || score === undefined) return 'tag-empty';
  if (score >= 80) return 'tag-hot';
  if (score >= 60) return 'tag-warm';
  return 'tag-cold';
});

</script>

<style scoped>
.score-banner {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: white;
  position: relative;
}

/* 2 stat cards row — Priority 15% wider để emphasize hierarchy */
.sb-stats {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 1px;
  background: #E4E5E9;
  position: relative;
}

.sb-card {
  padding: 14px 8px 16px;
  text-align: center;
  position: relative;
  min-width: 0;
  cursor: help;
  /* Fix min-height để layout không nhảy khi card có hoặc không có data */
  min-height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  /* Hover transition smooth */
  transition: box-shadow 0.18s ease, outline 0.18s ease;
  outline: 1px solid transparent;
  outline-offset: -1px;
}

/* Orange glow border on hover */
.sb-card:hover {
  outline: 1px solid #F97316;
  box-shadow:
    inset 0 0 0 1px rgba(249, 115, 22, 0.4),
    0 0 10px rgba(249, 115, 22, 0.35);
  z-index: 5;
}
.sb-card.priority {
  /* Priority bigger overall — number to 10% hơn + padding 1px hơn */
  padding: 14px 10px 18px;
}

/* Gradient fade từ màu → trắng đi xuống */
.sb-card.lead {
  background: linear-gradient(
    180deg,
    rgba(245, 158, 11, 0.22) 0%,
    rgba(245, 158, 11, 0.10) 50%,
    rgba(255, 255, 255, 1) 100%
  );
}
.sb-card.priority {
  background: linear-gradient(
    180deg,
    rgba(239, 68, 68, 0.22) 0%,
    rgba(239, 68, 68, 0.10) 50%,
    rgba(255, 255, 255, 1) 100%
  );
}

.sb-icon {
  font-size: 13px;
  line-height: 1;
  opacity: 0.85;
}
.sb-card.priority .sb-icon {
  font-size: 14px;
}
.sb-num {
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}
/* Priority number to hơn 10% (22px × 1.1 ≈ 24px) */
.sb-card.priority .sb-num {
  font-size: 26px;
  font-weight: 900;
}
.sb-card.lead .sb-num { color: #F59E0B; }
.sb-card.priority .sb-num { color: #EF4444; }

.sb-lbl {
  font-size: 10px;
  font-weight: 700;
  color: #6B7785;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  line-height: 1.3;
}
.sb-card.priority .sb-lbl {
  font-size: 10.5px;
  color: #1F2D3D;
}

.sb-trend {
  font-size: 10px;
  font-weight: 700;
  display: inline-block;
  padding: 1px 6px;
  border-radius: 999px;
  line-height: 1.5;
  white-space: nowrap;
  /* min-width đảm bảo tag '—' không quá ngắn so với tag dài (Champion) */
  min-width: 32px;
  text-align: center;
}
.sb-trend.tag-hot {
  background: rgba(239, 68, 68, 0.15);
  color: #DC2626;
}
.sb-trend.tag-warm {
  background: rgba(245, 158, 11, 0.15);
  color: #B45309;
}
.sb-trend.tag-cold {
  background: rgba(107, 119, 133, 0.12);
  color: #6B7785;
}
/* Empty tag — placeholder, nhạt hơn để không tranh attention */
.sb-trend.tag-empty {
  background: rgba(107, 119, 133, 0.08);
  color: #97A0AC;
  font-weight: 600;
}

/* Avatar + name row */
.sb-bottom {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 14px;
  background: white;
}

.sb-name-block {
  flex: 1;
  min-width: 0;
}

/* ═══════════════════════════════════════════════════════════════ */
/* TOOLTIP popover — dark background, rich content, animated in */
/* ═══════════════════════════════════════════════════════════════ */
.sb-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 8px;
  right: 8px;
  background: #1F2D3D;
  color: #FFFFFF;
  border-radius: 10px;
  padding: 14px 16px;
  font-size: 11.5px;
  line-height: 1.55;
  z-index: 1000;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(255,255,255,0.04);
  animation: tt-fade 0.15s ease;
  pointer-events: none;
  letter-spacing: -0.005em;
}
@keyframes tt-fade {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Arrow pointing up to card (shift theo card) */
.sb-tooltip .tt-arrow {
  position: absolute;
  top: -5px;
  width: 10px; height: 10px;
  background: #1F2D3D;
  transform: rotate(45deg);
}
.sb-tooltip.tt-lead .tt-arrow { left: 14%; }
.sb-tooltip.tt-priority .tt-arrow { left: 50%; transform: translateX(-50%) rotate(45deg); }

.sb-tooltip .tt-title {
  font-size: 13.5px;
  font-weight: 800;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sb-tooltip .tt-icon {
  font-size: 14px;
}
.sb-tooltip .tt-def {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.88);
  margin-bottom: 10px;
  line-height: 1.55;
}
.sb-tooltip .tt-def strong { color: white; font-weight: 700; }
.sb-tooltip .tt-formula {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  padding: 4px 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 10.5px;
  margin-bottom: 10px;
  color: #93C5FD;
  letter-spacing: -0.01em;
}
.sb-tooltip .tt-section {
  font-size: 10px;
  font-weight: 700;
  color: #FBBF24;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 8px 0 4px;
}
.sb-tooltip .tt-list {
  margin: 0;
  padding-left: 16px;
  list-style: none;
}
.sb-tooltip .tt-list li {
  position: relative;
  padding: 2px 0 2px 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.55;
}
.sb-tooltip .tt-list li::before {
  content: '→';
  position: absolute;
  left: -14px;
  top: 2px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 700;
}
.sb-tooltip .tt-list strong {
  color: #FBBF24;
  font-weight: 700;
}
.sb-tooltip .tt-action {
  margin-top: 10px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  font-size: 10.5px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.85);
}
</style>
