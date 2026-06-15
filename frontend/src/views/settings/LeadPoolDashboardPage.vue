<!--
  LeadPoolDashboardPage — 4 màn PRO gộp 1 trang (admin). Phase Lead Pool FIFO 2026-06-15.
  Bám 100% mockup finalized.html (màn #1 Dashboard + #4 Điều phối + #5 Nguồn + #6 Chất lượng).
  Dùng class chung lead-pool-theme.css. KHÔNG avatar giả.
-->
<template>
  <div class="lp-scope lpd" v-if="d">
    <!-- Thanh tiến độ vòng tua -->
    <div class="roundbar">
      <div class="rb-ic"><v-icon size="22" icon="mdi-rotate-right" color="#5bb8e5" /></div>
      <div class="rb-main">
        <div class="rb-top">
          <span class="rb-num">{{ d.round.distributedThisRound }} / {{ d.round.poolTotal }}</span>
          <span class="rb-lab">lead đã chia trong vòng tua hiện tại · còn {{ d.round.remaining }} lead chưa ai bóc</span>
        </div>
        <div class="rb-track"><i :style="{ width: roundPct + '%' }"></i></div>
      </div>
      <div class="rb-side"><div class="s-v">Vòng #{{ d.round.currentRound }}</div></div>
    </div>

    <!-- KPI -->
    <div class="kpi-row">
      <div class="kpi"><div class="ki"><span class="ic"><v-icon size="17" icon="mdi-inbox-outline" /></span>Pool chờ chia</div><div class="kv">{{ d.round.remaining }}</div><div class="ks">lead chưa ai bóc vòng này</div></div>
      <div class="kpi k-amber"><div class="ki"><span class="ic"><v-icon size="17" icon="mdi-clock-outline" /></span>Đang chăm</div><div class="kv">{{ d.today.pendingActive }}</div><div class="ks">đã chia, chờ ghi note</div></div>
      <div class="kpi k-green"><div class="ki"><span class="ic"><v-icon size="17" icon="mdi-check-circle-outline" /></span>Chia hôm nay</div><div class="kv">{{ d.today.requested }}</div><div class="ks">{{ d.today.notePct }}% đã ghi note ({{ d.today.noted }})</div><div class="kbar"><i :style="{ width: d.today.notePct + '%' }"></i></div></div>
      <div class="kpi k-red"><div class="ki"><span class="ic"><v-icon size="17" icon="mdi-rotate-left" /></span>Trả lại hôm nay</div><div class="kv">{{ d.today.returnedTotal }}</div><div class="ks">{{ d.today.returnedAuto }} tự động · {{ d.today.returnedManual }} sale trả</div></div>
    </div>

    <div class="lpd-cols">
      <!-- Điều phối sale -->
      <section class="panel lpd-span2">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-account-group-outline" /> Điều phối sale — Hôm nay</span></div>
        <table class="tbl">
          <thead><tr><th>Sale</th><th>Nhận</th><th>Đã note</th><th>Chưa note</th><th>Trả lại</th><th>Tỉ lệ note</th></tr></thead>
          <tbody>
            <tr v-for="s in d.salePerformance" :key="s.userId" :class="{ 'warn-row': s.notePct < 50 && s.received > 0 }">
              <td><div class="cust">
                <img v-if="s.avatarUrl" class="av sm" :src="s.avatarUrl" alt="" @error="onImgErr" />
                <span v-else class="av sm">{{ initials(s.fullName) }}</span>
                <span class="cn">{{ s.fullName || '—' }}</span>
              </div></td>
              <td class="num">{{ s.received }}</td>
              <td class="num" style="color:#0a7a47">{{ s.noted }}</td>
              <td class="num" :style="{ color: s.pending > 0 ? '#b8740a' : '' }">{{ s.pending }}</td>
              <td class="num" :style="{ color: s.returned > 2 ? '#c0291f' : '' }">{{ s.returned }}</td>
              <td><div class="flex ic-c gap8"><div class="sbar" style="width:100px"><i :style="{ width: s.notePct + '%', background: barColor(s.notePct) }"></i></div><span class="num">{{ s.notePct }}%</span></div></td>
            </tr>
            <tr v-if="d.salePerformance.length === 0"><td colspan="6" class="muted" style="text-align:center;padding:20px">Hôm nay chưa sale nào nhận lead.</td></tr>
          </tbody>
        </table>
      </section>

      <!-- Lead kẹt đáy -->
      <section class="panel">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-alert-outline" /> Lead kẹt đáy</span></div>
        <div class="panel-b">
          <div class="t-cap" style="margin-bottom:8px">Chia ≥ {{ d.stuckThreshold }} lần chưa chốt — có thể SĐT rác, cân nhắc xoá khỏi pool.</div>
          <div v-for="s in d.stuckLeads" :key="s.id" class="stuck-row">
            <span class="cn" style="flex:1">{{ s.name || '(không tên)' }}</span>
            <span class="num muted">{{ s.phone || '—' }}</span>
            <span class="chip c-r3">{{ s.pooledCount }} lần</span>
          </div>
          <div v-if="d.stuckLeads.length === 0" class="muted" style="text-align:center;padding:14px">Không có lead kẹt đáy. Pool khỏe.</div>
        </div>
      </section>

      <!-- Nguồn lead -->
      <section class="panel">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-folder-multiple-outline" /> Nguồn lead (7 ngày)</span></div>
        <div class="panel-b">
          <div v-for="b in d.sources.breakdown" :key="b.source" class="flex ic-c" style="justify-content:space-between;padding:6px 0">
            <span class="t-sub">{{ b.label }}</span><span class="num">{{ b.count }}</span>
          </div>
          <div style="height:1px;background:var(--line-2);margin:12px 0"></div>
          <div class="t-cap" style="margin-bottom:6px">Tệp chia pool (còn lại):</div>
          <div v-for="l in d.sources.lists" :key="l.id" class="flex ic-c" style="justify-content:space-between;padding:6px 0">
            <span class="t-sub">{{ l.name }}</span>
            <span class="chip" :class="l.remaining < 50 ? 'c-r3' : 'c-r1'">{{ l.remaining }} lead</span>
          </div>
          <div v-if="d.sources.lists.length === 0" class="muted">Chưa có tệp nào bật chia pool.</div>
        </div>
      </section>

      <!-- Chất lượng lead -->
      <section class="panel">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-shield-check-outline" /> Chất lượng lead (14 ngày)</span></div>
        <div class="panel-b">
          <div style="text-align:center;padding:10px 0">
            <div style="font-size:36px;font-weight:800;color:#12b76a;font-family:var(--mono)">{{ 100 - d.quality.returnRate }}%</div>
            <div class="t-cap">lead chăm tốt (không bị trả lại)</div>
          </div>
          <div class="flex ic-c" style="justify-content:space-between;margin-top:10px"><span class="t-sub">Bị trả lại</span><span class="chip c-r3">{{ d.quality.returnRate }}% ({{ d.quality.returnedCount }})</span></div>
          <div class="flex ic-c" style="justify-content:space-between;margin-top:6px"><span class="t-sub">Tự động (quá hạn note)</span><span class="num">{{ d.quality.auto }}</span></div>
          <div class="flex ic-c" style="justify-content:space-between;margin-top:6px"><span class="t-sub">Sale trả tay</span><span class="num">{{ d.quality.manual }}</span></div>
          <div class="t-cap" style="margin-top:10px">Tổng đã chia 14 ngày: {{ d.quality.distributed14d }}</div>
        </div>
      </section>
    </div>
  </div>
  <div v-else class="lp-scope" style="padding:40px;text-align:center;color:#6b7488">Đang tải tổng quan…</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLeadPool } from '@/composables/use-lead-pool';
import '@/assets/lead-pool-theme.css';

const { fetchAdminDashboard } = useLeadPool();
const d = ref<any>(null);

const roundPct = computed(() => {
  if (!d.value || !d.value.round.poolTotal) return 0;
  return Math.min(100, Math.round((d.value.round.distributedThisRound / d.value.round.poolTotal) * 100));
});

function initials(name: string | null) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[p.length - 1]?.[0] ?? '')).toUpperCase();
}
function barColor(pct: number) {
  if (pct >= 80) return '#12b76a';
  if (pct >= 50) return '#f5a524';
  return '#f04438';
}
function onImgErr(e: Event) { (e.target as HTMLImageElement).style.display = 'none'; }

onMounted(async () => { d.value = await fetchAdminDashboard(); });
</script>

<style scoped>
.lpd { display: flex; flex-direction: column; gap: 16px; }
.lpd-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.lpd-span2 { grid-column: span 2; }
.stuck-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
</style>
