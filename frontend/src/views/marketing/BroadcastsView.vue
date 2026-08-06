<!--
  Gửi tin hàng loạt (Broadcasts) — sub-view 4 Marketing.
  HS Atlas re-skin 2026-06-06: .mkt-top sticky + .mkt-body, bảng .tbl chuẩn HS.
  KHÔNG đổi logic — chỉ markup/CSS. Token global (--brand/--ink/--line/--surface…),
  classes .btn/.tbl/.chip/.bar/.status .dot tái dùng từ hs-crm-theme.css.
-->
<template>
  <div class="bc-page">
    <!-- ================== TOPBAR (HS .mkt-top scaffold) ================== -->
    <div class="mkt-top">
      <div>
        <div class="mtt">Gửi tin hàng loạt</div>
        <div class="mts">Gửi tin nhắn hàng loạt cho tệp khách hàng theo nhiều cách</div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" disabled title="Tính năng dự kiến phát hành ở Wave 2">
          <v-icon size="16">mdi-tray-arrow-down</v-icon> Nhập từ Excel
        </button>
        <button class="btn btn-primary btn-sm" @click="goto('/marketing/broadcasts/tao-moi')">
          <v-icon size="16">mdi-plus-circle-outline</v-icon> Soạn broadcast
        </button>
      </div>
    </div>

    <!-- ================== BODY ================== -->
    <div class="mkt-body">
      <!-- ----- Filter bar ----- -->
      <div class="filter-bar">
        <div class="field sm search-wrap">
          <v-icon size="16">mdi-magnify</v-icon>
          <input v-model="searchText" type="text" placeholder="Tìm theo tên broadcast..." />
        </div>

        <div class="chips">
          <span
            v-for="c in chips"
            :key="c.key"
            class="fchip"
            :class="{ active: stateFilter === c.key }"
            @click="stateFilter = c.key"
          >
            <span v-if="c.dot" class="fdot" :style="{ background: c.dot }"></span>
            {{ c.label }} <span class="count">{{ chipCount(c.key) }}</span>
          </span>
        </div>

        <div class="filter-spacer"></div>

        <button class="btn btn-ghost btn-sm" @click="loadList">
          <v-icon size="16">mdi-refresh</v-icon> Cập nhật
        </button>
      </div>

      <!-- ----- Table ----- -->
      <div class="card" style="overflow:hidden">
        <table class="tbl">
          <thead>
            <tr>
              <th class="col-stt center">#</th>
              <th class="col-name">Chiến dịch</th>
              <th class="col-audience">Tệp khách</th>
              <th class="col-progress">Tiến độ gửi</th>
              <th class="col-rate">Tỷ lệ thành công</th>
              <th class="col-error right">Lỗi</th>
              <th class="col-time">Thời gian</th>
              <th class="col-status">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && items.length === 0">
              <td colspan="8" class="empty-cell">
                <div class="empty-state">
                  <v-icon class="empty-icon spin" size="34" color="#97a0b3">mdi-loading</v-icon>
                  <div class="empty-desc">Đang tải…</div>
                </div>
              </td>
            </tr>
            <tr v-else-if="filtered.length === 0">
              <td colspan="8" class="empty-cell">
                <div class="empty-state">
                  <v-icon class="empty-icon" size="40" color="#97a0b3">mdi-bullhorn-outline</v-icon>
                  <div class="empty-title">{{ searchText || stateFilter !== 'all' ? 'Không có broadcast khớp bộ lọc' : 'Chưa có broadcast nào' }}</div>
                  <div class="empty-desc">{{ searchText || stateFilter !== 'all' ? 'Thử bỏ bộ lọc.' : 'Tạo broadcast đầu tiên để gửi tin hàng loạt.' }}</div>
                  <button v-if="!searchText && stateFilter === 'all'" class="btn btn-primary btn-sm" @click="goto('/marketing/broadcasts/tao-moi')">
                    <v-icon size="16">mdi-plus-circle-outline</v-icon> Tạo broadcast đầu tiên
                  </button>
                </div>
              </td>
            </tr>
            <tr v-for="(bc, idx) in filtered" v-else :key="bc.id" @click="openDetail(bc.id)">
              <!-- 1. STT -->
              <td class="center stt-cell">{{ idx + 1 }}</td>

              <!-- 2. Chiến dịch -->
              <td>
                <div class="cell-strong">{{ bc.name }}</div>
                <div class="row-sub">
                  <span class="chip" :class="audChip(bc.segmentSpec.kind)">
                    <v-icon size="12">{{ audIcon(bc.segmentSpec.kind) }}</v-icon>
                    {{ audSourceLabel(bc.segmentSpec.kind) }}
                  </span>
                </div>
              </td>

              <!-- 3. Tệp khách -->
              <td>
                <span class="chip chip-grey">{{ audDesc(bc) }}</span>
              </td>

              <!-- 4. Tiến độ gửi -->
              <td>
                <div class="prog">
                  <div class="bar"><i :style="{ width: pct(bc.sentCount, bc.totalRecipients) + '%' }"></i></div>
                  <span class="prog-frac num">{{ bc.sentCount }}/{{ bc.totalRecipients }}</span>
                </div>
              </td>

              <!-- 5. Tỷ lệ thành công -->
              <td>
                <div v-if="bc.sentCount > 0" class="prog">
                  <div class="bar"><i class="ok" :style="{ width: successPct(bc) + '%' }"></i></div>
                  <span class="prog-frac num">{{ successPct(bc) }}%</span>
                </div>
                <span v-else class="text-mute">—</span>
              </td>

              <!-- 6. Lỗi -->
              <td class="right">
                <span class="num err-num" :class="{ has: bc.failedCount > 0 }">{{ bc.failedCount }}</span>
              </td>

              <!-- 7. Thời gian -->
              <td>
                <div class="t-cap">{{ scheduleLabel(bc) }}</div>
                <div class="t-cap time-sub">{{ bc.scheduledAt ? fmtDateTime(bc.scheduledAt) : fmtDateTime(bc.createdAt) }}</div>
              </td>

              <!-- 8. Trạng thái -->
              <td>
                <span class="status" :class="`s-${bc.state}`">
                  <span class="dot" :style="{ background: stateDot(bc.state) }"></span>
                  {{ stateLabel(bc.state) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { listBroadcasts, type Broadcast, type BroadcastState } from '@/api/automation/broadcasts';

const router = useRouter();
const items = ref<Broadcast[]>([]);
const loading = ref(false);
const searchText = ref('');
const stateFilter = ref<'all' | BroadcastState>('all');

// label = text thuần (không emoji); dot = màu trạng thái (HS .status .dot).
const chips: Array<{ key: 'all' | BroadcastState; label: string; dot?: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'running', label: 'Đang chạy', dot: 'var(--success)' },
  { key: 'paused', label: 'Tạm dừng', dot: 'var(--ink-4)' },
  { key: 'completed', label: 'Hoàn tất', dot: 'var(--info)' },
  { key: 'scheduled', label: 'Hẹn lịch', dot: 'var(--warning)' },
  { key: 'draft', label: 'Nháp', dot: 'var(--chip-purple)' },
];

const filtered = computed(() => {
  return items.value.filter((bc) => {
    if (stateFilter.value !== 'all' && bc.state !== stateFilter.value) return false;
    if (searchText.value) {
      const q = searchText.value.toLowerCase();
      if (!bc.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
});

function chipCount(key: 'all' | BroadcastState): number {
  if (key === 'all') return items.value.length;
  return items.value.filter((b) => b.state === key).length;
}

async function loadList() {
  loading.value = true;
  try { items.value = await listBroadcasts(); } finally { loading.value = false; }
}

function goto(path: string) { router.push(path); }
function openDetail(id: string) { router.push(`/marketing/broadcasts/${id}`); }
function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}
function pct(a: number, b: number): number { return b === 0 ? 0 : Math.round((a / b) * 100); }
function successPct(bc: Broadcast): number { return bc.sentCount === 0 ? 0 : Math.round(((bc.sentCount - bc.failedCount) / bc.sentCount) * 100); }

function stateLabel(s: BroadcastState): string {
  return ({ draft: 'Nháp', scheduled: 'Hẹn lịch', running: 'Đang chạy', paused: 'Tạm dừng', completed: 'Hoàn tất', cancelled: 'Đã huỷ' } as Record<string, string>)[s] || s;
}
// Màu dot trạng thái (HS .status .dot) theo state.
function stateDot(s: BroadcastState): string {
  return ({ running: 'var(--success)', scheduled: 'var(--warning)', paused: 'var(--ink-4)', completed: 'var(--info)', draft: 'var(--chip-purple)', cancelled: 'var(--error)' } as Record<string, string>)[s] || 'var(--ink-4)';
}

// Chip màu + icon mdi cho nguồn đối tượng (thay emoji cũ).
function audChip(kind: string): string {
  return ({ manual: 'chip-grey', filter: 'chip-green', 'customer-list': 'chip-blue', tag: 'chip-purple', 'preset-segment': 'chip-amber' } as Record<string, string>)[kind] || 'chip-grey';
}
function audIcon(kind: string): string {
  return ({ manual: 'mdi-hand-back-right-outline', filter: 'mdi-filter-variant', 'customer-list': 'mdi-folder-account-outline', tag: 'mdi-tag-outline', 'preset-segment': 'mdi-flash-outline' } as Record<string, string>)[kind] || 'mdi-account-multiple-outline';
}
function audSourceLabel(kind: string): string {
  return ({ manual: 'Thủ công', filter: 'Bộ lọc', 'customer-list': 'Tệp KH', tag: 'Nhãn', 'preset-segment': 'Pre-set' } as Record<string, string>)[kind] || kind;
}
function audDesc(bc: Broadcast): string {
  const s = bc.segmentSpec as Record<string, unknown> & { kind: string };
  if (s.kind === 'customer-list') return `List #${String(s.listId || '').slice(0, 8)}…`;
  if (s.kind === 'tag') return `${((s.tagIds as string[]) || []).length} nhãn · ${s.match || 'any'}`;
  if (s.kind === 'preset-segment') return String(s.presetKey);
  if (s.kind === 'manual') return `${((s.contactIds as string[]) || []).length} KH`;
  return 'Bộ lọc tuỳ chỉnh';
}
function scheduleLabel(bc: Broadcast): string {
  if (bc.scheduleKind === 'now') return 'Gửi ngay';
  if (bc.scheduleKind === 'scheduled') return 'Hẹn lịch';
  return 'Định kỳ';
}

onMounted(() => { loadList(); });
</script>

<style scoped>
.bc-page {
  width: 100%;
  font-size: 13px;
  color: var(--ink);
}

/* ----- Topbar action group (.mkt-top dùng class global) ----- */
.actions { display: flex; gap: 8px; flex-shrink: 0; }

/* ----- Filter bar ----- */
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.search-wrap { width: 320px; }
.search-wrap input { width: 100%; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.fchip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--r-pill);
  font-size: 12.5px;
  font-weight: 600;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink-2);
  cursor: pointer;
  transition: background .12s, border-color .12s, color .12s;
}
.fchip:hover { background: var(--surface-3); }
.fchip.active {
  background: var(--brand-soft);
  border-color: var(--brand);
  color: var(--brand-700);
}
.fchip .fdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.fchip .count {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: var(--r-pill);
}
.fchip.active .count { background: var(--surface); color: var(--brand-700); }
.filter-spacer { flex: 1; }

/* ----- Table cells ----- */
.tbl tbody tr { cursor: pointer; }
.center { text-align: center; }
.right { text-align: right; }
.stt-cell { color: var(--ink-4); font-family: var(--mono); }
.row-sub { margin-top: 5px; }
.text-mute { color: var(--ink-4); }

.col-stt { width: 40px; }
.col-name { width: 22%; }
.col-audience { width: 13%; }
.col-progress { width: 15%; }
.col-rate { width: 14%; }
.col-error { width: 70px; }
.col-time { width: 116px; }
.col-status { width: 116px; }

/* Progress (.bar dùng class global; bọc thêm số mono) */
.prog { display: flex; align-items: center; gap: 9px; }
.prog .bar { width: 84px; flex: none; }
.prog .bar i { background: var(--brand); }
.prog .bar i.ok { background: var(--success); }
.prog-frac { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; }

/* Lỗi — mono, đỏ khi >0 */
.err-num { font-size: 13px; color: var(--ink-4); }
.err-num.has { color: var(--error); font-weight: 700; }

/* Thời gian */
.time-sub { color: var(--ink-4); margin-top: 2px; }

/* Status pill màu nền theo state (dùng .status .dot global cho chấm) */
.status { padding: 3px 10px; border-radius: var(--r-xs); white-space: nowrap; }
.s-running   { background: var(--success-soft); color: #157f3c; }
.s-scheduled { background: var(--warning-soft); color: #b45309; }
.s-paused    { background: var(--surface-3);    color: var(--ink-2); }
.s-completed { background: var(--info-soft);    color: var(--brand-700); }
.s-draft     { background: var(--chip-purple-bg); color: #6d28d9; }
.s-cancelled { background: var(--error-soft);   color: #c0392b; }

/* Empty / loading state */
.empty-cell { padding: 0 !important; }
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 52px 24px;
  text-align: center;
}
.empty-title { font-size: 14px; font-weight: 700; color: var(--ink); }
.empty-desc { font-size: 13px; color: var(--ink-3); margin-bottom: 6px; }
</style>
