<!--
  LeadPoolLogPage — Nhật ký chia (admin). Phase Lead Pool FIFO 2026-06-15.
  Bám 100% mockup finalized.html màn #3. Dùng class chung lead-pool-theme.css.
  KHÔNG avatar giả (chỉ hiện img khi có avatarUrl thật, fallback initials).
-->
<template>
  <div class="lp-scope lpl">
    <!-- Thanh tiến độ vòng tua (roundbar mockup) -->
    <div class="roundbar" v-if="dash">
      <div class="rb-ic"><v-icon size="22" icon="mdi-rotate-right" color="#5bb8e5" /></div>
      <div class="rb-main">
        <div class="rb-top">
          <span class="rb-num">{{ dash.round.distributedThisRound }} / {{ dash.round.poolTotal }}</span>
          <span class="rb-lab">lead đã chia trong vòng tua này · còn {{ dash.round.remaining }} lead chưa ai bóc</span>
        </div>
        <div class="rb-track"><i :style="{ width: roundPct + '%' }"></i></div>
      </div>
      <div class="rb-side"><div class="s-v">Vòng #{{ dash.round.currentRound }}</div><div class="s-l">lead mới chen<br>lên đầu vòng</div></div>
    </div>

    <div class="page-head">
      <div>
        <h1 class="h-page">Nhật ký chia lead</h1>
        <div class="t-sub mt8">Mỗi lần phát lead = 1 dòng. Xem theo ngày, đếm số lần đã chia mỗi khách.</div>
      </div>
      <div class="flex ic-c gap8" style="flex-wrap:wrap">
        <input type="date" v-model="filterDate" class="inp" @change="reload" />
        <select v-model="filterUser" class="inp" @change="reload">
          <option value="">Tất cả sale</option>
          <option v-for="s in saleOptions" :key="s.userId" :value="s.userId">{{ s.fullName }}</option>
        </select>
        <button class="btn btn-sm" @click="reload"><v-icon size="16" icon="mdi-refresh" /> Làm mới</button>
      </div>
    </div>

    <div v-if="loading" class="t-sub" style="padding:30px;text-align:center">Đang tải nhật ký…</div>
    <div v-else-if="groups.length === 0" class="t-sub" style="padding:30px;text-align:center">Chưa có lần chia nào.</div>

    <div v-for="g in groups" :key="g.dateKey" class="panel" style="margin-bottom:12px;overflow:hidden">
      <div class="dayhd" style="margin:0;border:none;border-radius:0;border-bottom:1px solid var(--line-2)" @click="toggle(g.dateKey)">
        <span class="dh-chev"><v-icon size="18" :icon="collapsed.has(g.dateKey) ? 'mdi-chevron-right' : 'mdi-chevron-down'" /></span>
        <span class="dh-t">{{ g.dateLabel }}</span>
        <span class="dh-c">{{ g.count }} lần chia</span>
      </div>
      <table v-show="!collapsed.has(g.dateKey)" class="tbl">
        <thead>
          <tr><th>Giờ</th><th>Khách hàng</th><th>SĐT</th><th>Sale nhận</th><th>Nguồn</th><th>Lần</th><th>Trạng thái</th><th>Ghi chú sale</th></tr>
        </thead>
        <tbody>
          <tr v-for="it in g.items" :key="it.id" :class="{ 'warn-row': it.round >= 5 }">
            <td class="num">{{ fmtTime(it.distributedAt) }}</td>
            <td>
              <div class="cust">
                <img v-if="it.contactAvatar" class="av sm" :src="it.contactAvatar" alt="" @error="onImgErr" />
                <span v-else class="av sm">{{ initials(it.contactName) }}</span>
                <span class="cn">{{ it.contactName || '(không tên)' }}</span>
              </div>
            </td>
            <td class="num">{{ it.phone || '—' }}</td>
            <td>
              <div class="cust">
                <img v-if="it.saleAvatar" class="av sm" :src="it.saleAvatar" alt="" @error="onImgErr" />
                <span v-else class="av sm">{{ initials(it.saleName) }}</span>
                <span class="cn">{{ it.saleName || '—' }}</span>
              </div>
            </td>
            <td><span class="pill-src">{{ it.sourceLabel }}</span></td>
            <td><span class="chip" :class="roundClass(it.round)">{{ it.round }}{{ it.round >= 5 ? ' ⚠' : '' }}</span></td>
            <td>
              <span v-if="it.status" class="statecell" :style="statusStyle(it.status.color)">
                <span class="dot" :style="{ background: it.status.color || '#9CA3AF' }"></span>{{ it.status.name }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td class="muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ it.note || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLeadPool } from '@/composables/use-lead-pool';
import '@/assets/lead-pool-theme.css';

const { fetchDistributionLog, fetchAdminDashboard } = useLeadPool();

const loading = ref(false);
const groups = ref<Array<{ dateKey: string; dateLabel: string; count: number; items: any[] }>>([]);
const dash = ref<any>(null);
const collapsed = ref(new Set<string>());
const filterDate = ref('');
const filterUser = ref('');

const roundPct = computed(() => {
  if (!dash.value || !dash.value.round.poolTotal) return 0;
  return Math.min(100, Math.round((dash.value.round.distributedThisRound / dash.value.round.poolTotal) * 100));
});
const saleOptions = computed(() => dash.value?.salePerformance ?? []);

function toggle(key: string) {
  if (collapsed.value.has(key)) collapsed.value.delete(key);
  else collapsed.value.add(key);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
}
function initials(name: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}
function roundClass(r: number) {
  if (r >= 5) return 'c-r3';
  if (r >= 2) return 'c-r2';
  return 'c-r1';
}
function statusStyle(color: string | null) {
  const c = color || '#9CA3AF';
  return { background: c + '1f', color: c };
}
function onImgErr(e: Event) { (e.target as HTMLImageElement).style.display = 'none'; }

async function reload() {
  loading.value = true;
  try {
    const [log, d] = await Promise.all([
      fetchDistributionLog({ date: filterDate.value || undefined, userId: filterUser.value || undefined }),
      dash.value ? Promise.resolve(dash.value) : fetchAdminDashboard(),
    ]);
    groups.value = log.groups;
    if (!dash.value) dash.value = d;
  } finally {
    loading.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.lpl { display: flex; flex-direction: column; }
.mt8 { margin-top: 8px; }
</style>
