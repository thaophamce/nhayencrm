<!--
  LeadPoolDashboardPage v2 — Tổng quan phân tích sale + lead (admin). 2026-06-15.
  Anh chốt qua /office-hours: bố cục A+C — 3 thẻ insight + bảng xếp hạng sale trung tâm.
  Mục tiêu: chủ/quản lý biết SALE NÀO TỐT/TỆ + LEAD NÀO RÁC. Theme HS (lp-scope).
-->
<template>
  <div class="lp-scope lpd" v-if="d">
    <!-- Dải vòng tua mỏng -->
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

    <!-- Bộ lọc kỳ -->
    <div class="lpd-period">
      <span class="t-cap" style="margin-right:8px">Khoảng thời gian:</span>
      <button v-for="p in PERIODS" :key="p.key" class="lpd-pbtn" :class="{ on: period === p.key }" @click="changePeriod(p.key)">{{ p.label }}</button>
    </div>

    <!-- 3 THẺ INSIGHT (C) — trả lời nhanh -->
    <div class="lpd-insights">
      <div class="lpd-ins ins-good">
        <div class="ins-h"><v-icon size="16" icon="mdi-trophy-outline" /> Sale giỏi nhất</div>
        <div v-if="d.insight.topSale" class="ins-body">
          <div class="cust">
            <img v-if="d.insight.topSale.avatarUrl" class="av sm" :src="d.insight.topSale.avatarUrl" alt="" @error="onImgErr" />
            <span v-else class="av sm">{{ initials(d.insight.topSale.fullName) }}</span>
            <span class="cn">{{ d.insight.topSale.fullName || '—' }}</span>
            <span class="grade-pill" :class="'g-' + d.insight.topSale.grade">{{ d.insight.topSale.grade }}</span>
          </div>
          <div class="ins-sub">{{ d.insight.topSale.notePct }}% note · đẩy {{ d.insight.topSale.good }} KH lên tốt · {{ fmtSpeed(d.insight.topSale.avgNoteMinutes) }}</div>
        </div>
        <div v-else class="ins-empty">Chưa đủ dữ liệu</div>
      </div>

      <div class="lpd-ins ins-bad">
        <div class="ins-h"><v-icon size="16" icon="mdi-alert-outline" /> Sale cần nhắc</div>
        <div v-if="d.insight.worstSale" class="ins-body">
          <div class="cust">
            <img v-if="d.insight.worstSale.avatarUrl" class="av sm" :src="d.insight.worstSale.avatarUrl" alt="" @error="onImgErr" />
            <span v-else class="av sm">{{ initials(d.insight.worstSale.fullName) }}</span>
            <span class="cn">{{ d.insight.worstSale.fullName || '—' }}</span>
            <span class="grade-pill" :class="'g-' + d.insight.worstSale.grade">{{ d.insight.worstSale.grade }}</span>
          </div>
          <div class="ins-sub">{{ d.insight.worstSale.notePct }}% note · đẩy {{ d.insight.worstSale.good }} KH lên tốt · {{ fmtSpeed(d.insight.worstSale.avgNoteMinutes) }}</div>
        </div>
        <div v-else class="ins-empty">Mọi sale đều ổn 👍</div>
      </div>

      <div class="lpd-ins ins-trash">
        <div class="ins-h"><v-icon size="16" icon="mdi-trash-can-outline" /> Nguồn rác nhất</div>
        <div v-if="d.insight.worstSource" class="ins-body">
          <div class="cn">{{ d.insight.worstSource.label }}</div>
          <div class="ins-sub">trả lại {{ d.insight.worstSource.returnRate }}% ({{ d.insight.worstSource.returned }}/{{ d.insight.worstSource.distributed }})</div>
        </div>
        <div v-else class="ins-empty">Chưa có nguồn nào bị trả</div>
      </div>
    </div>

    <!-- BẢNG XẾP HẠNG SALE (A) -->
    <section class="panel">
      <div class="panel-h">
        <span class="ph-t"><v-icon size="18" icon="mdi-account-star-outline" /> Xếp hạng sale — {{ periodLabel }}</span>
        <span class="t-cap">điểm = chăm 35% + chất lượng 40% + tốc độ 25%</span>
      </div>
      <div class="tbl-scroll">
      <table class="tbl">
        <thead><tr>
          <th>#</th><th>Sale</th><th>Nhận</th><th>Tỉ lệ note</th><th>Đẩy KH lên tốt</th><th>Tốc độ TB</th><th>Điểm</th><th>Xếp loại</th>
        </tr></thead>
        <tbody>
          <tr v-for="(s, i) in d.salePerformance" :key="s.userId" :class="{ 'warn-row': s.grade === 'D' }">
            <td class="num rk" :class="{ hot: Number(i) === 0 }">{{ Number(i) + 1 }}</td>
            <td><div class="cust">
              <img v-if="s.avatarUrl" class="av sm" :src="s.avatarUrl" alt="" @error="onImgErr" />
              <span v-else class="av sm">{{ initials(s.fullName) }}</span>
              <span class="cn">{{ s.fullName || '—' }}</span>
              <span v-if="s.lowSample" class="lowsample" title="Ít mẫu — điểm có thể chưa chính xác">ít mẫu</span>
            </div></td>
            <td class="num">{{ s.received }}</td>
            <td><div class="flex ic-c gap8"><div class="sbar" style="width:80px"><i :style="{ width: s.notePct + '%', background: barColor(s.notePct) }"></i></div><span class="num">{{ s.notePct }}%</span></div></td>
            <td><div class="flex ic-c gap8"><div class="sbar" style="width:80px"><i :style="{ width: s.qualityPct + '%', background: barColor(s.qualityPct) }"></i></div><span class="num">{{ s.good }} KH ({{ s.qualityPct }}%)</span></div></td>
            <td class="num" :style="{ color: s.avgNoteMinutes !== null && s.avgNoteMinutes <= 30 ? '#0a7a47' : s.avgNoteMinutes !== null && s.avgNoteMinutes > 240 ? '#c0291f' : '' }">{{ fmtSpeed(s.avgNoteMinutes) }}</td>
            <td><span class="score-big" :class="'g-' + s.grade">{{ s.score }}</span></td>
            <td><span class="grade-flag" :class="'g-' + s.grade">{{ gradeLabel(s.grade) }}</span></td>
          </tr>
          <tr v-if="d.salePerformance.length === 0"><td colspan="8" class="muted" style="text-align:center;padding:24px">Chưa có sale nào nhận lead trong kỳ này.</td></tr>
        </tbody>
      </table>
      </div>
    </section>

    <!-- KPI nhỏ -->
    <div class="kpi-row">
      <div class="kpi"><div class="ki"><span class="ic"><v-icon size="17" icon="mdi-inbox-outline" /></span>Pool chờ chia</div><div class="kv">{{ d.round.remaining }}</div><div class="ks">lead chưa ai bóc vòng này</div></div>
      <div class="kpi k-amber"><div class="ki"><span class="ic"><v-icon size="17" icon="mdi-clock-outline" /></span>Đang chăm</div><div class="kv">{{ d.today.pendingActive }}</div><div class="ks">đã chia, chờ ghi note</div></div>
      <div class="kpi k-green"><div class="ki"><span class="ic"><v-icon size="17" icon="mdi-check-circle-outline" /></span>Chia hôm nay</div><div class="kv">{{ d.today.requested }}</div><div class="ks">{{ d.today.notePct }}% đã ghi note</div></div>
      <div class="kpi k-red"><div class="ki"><span class="ic"><v-icon size="17" icon="mdi-rotate-left" /></span>Trả lại hôm nay</div><div class="kv">{{ d.today.returnedTotal }}</div><div class="ks">{{ d.today.returnedAuto }} tự động · {{ d.today.returnedManual }} sale</div></div>
    </div>

    <!-- 2 cột dưới: trạng thái KH + chất lượng lead -->
    <div class="lpd-cols">
      <section class="panel">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-tag-multiple-outline" /> Trạng thái khách hàng (kỳ này)</span></div>
        <div class="panel-b">
          <div v-for="st in d.statusBreakdown" :key="st.id" class="status-row">
            <span class="statecell" :style="statusStyle(st.color)"><span class="dot" :style="{ background: st.color || '#9CA3AF' }"></span>{{ st.name }}</span>
            <div class="sbar" style="flex:1"><i :style="{ width: st.pct + '%', background: st.color || '#9CA3AF' }"></i></div>
            <span class="num" style="min-width:60px;text-align:right">{{ st.count }} · {{ st.pct }}%</span>
          </div>
          <div v-if="d.statusBreakdown.length === 0" class="muted" style="padding:12px">Chưa có KH nào được đặt trạng thái trong kỳ.</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-h"><span class="ph-t"><v-icon size="18" icon="mdi-shield-check-outline" /> Chất lượng lead theo nguồn</span></div>
        <div class="tbl-scroll">
        <table class="tbl">
          <thead><tr><th>Nguồn</th><th>Đã chia</th><th>Bị trả</th><th>Tỉ lệ trả</th></tr></thead>
          <tbody>
            <tr v-for="sq in d.sourceQuality" :key="sq.source" :class="{ 'warn-row': sq.returnRate >= 30 }">
              <td class="cn">{{ sq.label }}</td>
              <td class="num">{{ sq.distributed }}</td>
              <td class="num">{{ sq.returned }}</td>
              <td><div class="flex ic-c gap8"><div class="sbar" style="width:60px"><i :style="{ width: sq.returnRate + '%', background: sq.returnRate >= 30 ? '#f04438' : sq.returnRate >= 15 ? '#f5a524' : '#12b76a' }"></i></div><span class="num" :style="{ color: sq.returnRate >= 30 ? '#c0291f' : '' }">{{ sq.returnRate }}%</span></div></td>
            </tr>
            <tr v-if="d.sourceQuality.length === 0"><td colspan="4" class="muted" style="text-align:center;padding:16px">Chưa có dữ liệu nguồn.</td></tr>
          </tbody>
        </table>
        </div>
        <div class="panel-b" style="border-top:1px solid var(--line-2)">
          <div class="t-cap" style="margin-bottom:6px"><v-icon size="14" icon="mdi-alert-outline" /> Lead kẹt đáy (chia ≥ {{ d.stuckThreshold }} lần, nghi rác):</div>
          <div v-for="s in d.stuckLeads.slice(0, 5)" :key="s.id" class="stuck-row">
            <span class="cn" style="flex:1">{{ s.name || '(không tên)' }}</span>
            <span class="num muted">{{ s.phone || '—' }}</span>
            <span class="chip c-r3">{{ s.pooledCount }} lần</span>
          </div>
          <div v-if="d.stuckLeads.length === 0" class="muted">Không có lead kẹt đáy. Pool khỏe.</div>
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
const period = ref<'today' | '7d' | '30d'>('7d');

const PERIODS = [
  { key: 'today' as const, label: 'Hôm nay' },
  { key: '7d' as const, label: '7 ngày' },
  { key: '30d' as const, label: '30 ngày' },
];
const periodLabel = computed(() => PERIODS.find((p) => p.key === period.value)?.label ?? '7 ngày');

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
function fmtSpeed(min: number | null) {
  if (min === null) return '—';
  if (min < 60) return `${min}'`;
  if (min < 1440) return `${Math.round(min / 60 * 10) / 10}h`;
  return `${Math.round(min / 1440)} ngày`;
}
function gradeLabel(g: string) {
  return ({ A: '🟢 Phát huy tốt', B: '🟡 Ổn', C: '🟠 Trung bình', D: '🔴 Cần nhắc' } as Record<string, string>)[g] ?? g;
}
function statusStyle(color: string | null) {
  const c = color || '#9CA3AF';
  return { background: c + '1f', color: c };
}
function onImgErr(e: Event) { (e.target as HTMLImageElement).style.display = 'none'; }

async function load() { d.value = await fetchAdminDashboard(period.value); }
async function changePeriod(p: 'today' | '7d' | '30d') {
  if (period.value === p) return;
  period.value = p;
  d.value = null;
  await load();
}
onMounted(load);
</script>

<style scoped>
.lpd { display: flex; flex-direction: column; gap: 16px; width: 100%; }
.lpd-period { display: flex; align-items: center; }
.lpd-pbtn { font-size: 12.5px; font-weight: 600; padding: 6px 14px; border: 1px solid var(--line); background: #fff; color: var(--ink-2); cursor: pointer; border-radius: 999px; margin-right: 6px; font-family: inherit; }
.lpd-pbtn.on { background: var(--brand); border-color: var(--brand); color: #fff; }

.lpd-insights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.lpd-ins { background: #fff; border: 1px solid var(--line); border-radius: var(--r-lg); padding: 14px 16px; box-shadow: var(--sh-xs); position: relative; overflow: hidden; }
.lpd-ins::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
.ins-good::before { background: #12b76a; }
.ins-bad::before { background: #f04438; }
.ins-trash::before { background: #6b7488; }
.ins-h { font-size: 12px; font-weight: 700; color: var(--ink-3); display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.ins-body { display: flex; flex-direction: column; gap: 6px; }
.ins-sub { font-size: 11.5px; color: var(--ink-3); }
.ins-empty { font-size: 12px; color: var(--ink-4); padding: 6px 0; }

.grade-pill { font-size: 11px; font-weight: 800; padding: 1px 8px; border-radius: 999px; }
.grade-flag { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.score-big { font-size: 16px; font-weight: 800; font-family: 'Roboto Mono', monospace; padding: 2px 8px; border-radius: 7px; }
.g-A { background: #e8f6ed; color: #0a7a47; }
.g-B { background: #fdf4e3; color: #b8740a; }
.g-C { background: #fdf0e6; color: #c2570a; }
.g-D { background: #fdecec; color: #c0291f; }
.lowsample { font-size: 10px; color: var(--ink-4); background: var(--surface-3); padding: 1px 6px; border-radius: 999px; }

.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 0; }
.lpd-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.status-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
.stuck-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line-2); font-size: 12.5px; }
</style>
