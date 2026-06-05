<!--
  NotifyOwnerBox — bảng "Báo nội bộ" 3 đích (I10 2026-06-04, Anh chốt).
  - Sale phụ trách nick (owner): tick được, LÀM THẬT (v-model).
  - Quản lý của Sale: badge "Đang phát triển", khóa.
  - Nhóm Zalo Tool HS Holding: badge "Đang phát triển", khóa.
  v-model = bool owner (chỉ owner làm thật; 2 đích kia defer).
-->
<template>
  <div class="notify-box">
    <div class="notify-title">🔔 Báo nội bộ khi sự kiện xảy ra</div>
    <label class="notify-row">
      <input type="checkbox" class="notify-check" :checked="modelValue" @change="onToggle" />
      <span class="notify-label">→ <span class="who">Sale phụ trách nick</span></span>
      <span class="nbadge ok">Hoạt động</span>
    </label>
    <div class="notify-row">
      <input type="checkbox" class="notify-check" disabled />
      <span class="notify-label">→ <span class="who">Quản lý của Sale</span></span>
      <span class="nbadge dev">Đang phát triển</span>
    </div>
    <div class="notify-row">
      <input type="checkbox" class="notify-check" disabled />
      <span class="notify-label">→ <span class="who">Nhóm Zalo Tool — HS Holding</span></span>
      <span class="nbadge dev">Đang phát triển</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
function onToggle(e: Event){ emit('update:modelValue', (e.target as HTMLInputElement).checked); }
</script>

<style scoped>
.notify-box{margin-top:11px;border:1px solid var(--border,#dddddd);border-radius:7px;background:var(--bg-soft,#f8fafc);padding:9px 12px;}
.notify-title{font-size:12px;font-weight:700;color:var(--text,#181d26);margin-bottom:6px;}
.notify-row{display:flex;align-items:center;gap:9px;padding:5px 0;border-top:1px dashed var(--border,#dddddd);cursor:default;}
.notify-row:first-of-type{border-top:none;}
.notify-check{width:17px;height:17px;flex-shrink:0;accent-color:#0a7d3c;cursor:pointer;}
.notify-check:disabled{cursor:not-allowed;opacity:.5;}
.notify-label{flex:1;font-size:12.5px;color:var(--text-2,#333840);}
.notify-label .who{font-weight:600;color:var(--text,#181d26);}
.nbadge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;white-space:nowrap;}
.nbadge.ok{background:#e8f6ee;color:#0a7d3c;}
.nbadge.dev{background:#f0ecff;color:#6b4bd8;border:1px dashed #c5b6f5;}
</style>
