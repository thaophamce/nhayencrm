<template>
  <div class="lists-view">
    <header class="at-page-header">
      <div>
        <h1 class="at-page-title">📂 Tệp khách hàng</h1>
        <p class="at-page-subtitle">
          Paste / Excel / Lead Ads (FB · TikTok · Google · Zalo) đổ về tệp tự động theo <b>#mã</b> trong tên chiến dịch.
          Tệp KH làm <b>audience source</b> cho Sequence / Broadcast / Campaign.
        </p>
      </div>
      <button class="at-btn at-btn--sm at-btn--action" @click="showCreate = true">
        <v-icon size="18">mdi-plus</v-icon>
        Tạo tệp mới
      </button>
    </header>

    <!-- Phase Multi-Source Lead Ads 2026-05-27 — Stats row -->
    <div class="stats-row">
      <button class="stat-card" :class="{ active: platformFilter === 'all' }" @click="onPlatformFilter('all')">
        <div class="stat-num">{{ stats.totalLists.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">Tổng tệp</div>
      </button>
      <button class="stat-card" :class="{ active: platformFilter === 'leadads' }" @click="onPlatformFilter('leadads')">
        <div class="stat-num">{{ stats.leadAdsLists.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">📣 Lead Ads</div>
      </button>
      <button class="stat-card" :class="{ active: platformFilter === 'paste' }" @click="onPlatformFilter('paste')">
        <div class="stat-num">{{ stats.pasteLists.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">📋 Paste / File</div>
      </button>
      <div class="stat-card stat-card-readonly">
        <div class="stat-num">{{ stats.totalEntries.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">SĐT trong các tệp</div>
      </div>
      <div class="stat-card stat-card-readonly">
        <div class="stat-num">{{ stats.totalHasZalo.toLocaleString('vi-VN') }}</div>
        <div class="stat-label">SĐT có Zalo</div>
      </div>
    </div>

    <!-- Status tabs: Đang dùng / Lưu trữ -->
    <div class="status-tabs">
      <button
        class="status-tab"
        :class="{ active: listsStatus === 'active' }"
        @click="onSwitchStatus('active')"
      >
        <v-icon size="16">mdi-folder-account-outline</v-icon>
        Đang dùng
        <span class="count">{{ listsStatus === 'active' ? listsTotal : '' }}</span>
      </button>
      <button
        class="status-tab"
        :class="{ active: listsStatus === 'archived' }"
        @click="onSwitchStatus('archived')"
      >
        <v-icon size="16">mdi-archive-outline</v-icon>
        Lưu trữ
        <span class="count">{{ listsStatus === 'archived' ? listsTotal : '' }}</span>
      </button>
      <button
        class="status-tab"
        :class="{ active: listsStatus === 'all' }"
        @click="onSwitchStatus('all')"
      >
        <v-icon size="16">mdi-view-list</v-icon>
        Tất cả
      </button>
      <div class="spacer"></div>
      <div class="search">
        <v-icon size="14">mdi-magnify</v-icon>
        <input
          v-model="listsSearch"
          placeholder="Tìm tên tệp..."
          @input="debouncedFetch"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!loadingLists && lists.length === 0" class="empty-state">
      <div class="empty-icon">📂</div>
      <h3 v-if="listsStatus === 'archived'">Chưa có tệp nào lưu trữ</h3>
      <h3 v-else>Chưa có tệp khách hàng nào</h3>
      <p v-if="listsStatus === 'active'">
        Bấm "Tạo tệp mới" để paste/upload danh sách SĐT đầu tiên.
      </p>
      <p v-else-if="listsStatus === 'archived'">
        Tệp lưu trữ sẽ xuất hiện ở đây sau khi anh bấm "Lưu trữ" trên 1 tệp đang dùng.
      </p>
    </div>

    <!-- Lists table -->
    <div v-else class="lists-table-wrap">
      <table class="lists-table">
        <thead>
          <tr>
            <th>Tên tệp</th>
            <th>Nguồn</th>
            <th>Mã đồng bộ</th>
            <th>Chia sẻ</th>
            <th>Ngày tạo</th>
            <th class="right">Tổng</th>
            <th class="right">Hợp lệ</th>
            <th class="right">Trùng</th>
            <th class="right">Có Zalo</th>
            <th>Tiến độ</th>
            <th>Trạng thái</th>
            <th class="right">Action</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="list in filteredLists"
            :key="list.id"
            class="row-clickable"
            @click="goToDetail(list.id)"
          >
            <td>
              <div class="list-name-cell">
                <span class="icon-em">{{ list.iconEmoji || '📂' }}</span>
                <div>
                  <div class="nm">{{ list.name }}</div>
                  <div class="sub">{{ list.totalEntries.toLocaleString('vi-VN') }} SĐT · {{ list.createdBy?.fullName ?? list.createdBy?.email ?? '—' }}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="source-chip" :class="sourceClass(list.sourceType)">{{ sourceLabel(list.sourceType) }}</span>
            </td>
            <td>
              <span v-if="list.integrationKey === '__UNROUTED__'" class="key-chip unrouted" title="Lead chảy về tệp này vì không khớp #mã nào — anh nên đổi tên chiến dịch hoặc tạo tệp mới có mã đó.">
                🚨 UNROUTED
              </span>
              <span v-else-if="list.integrationKey" class="key-chip" :title="`Đặt tên chiến dịch FB/TikTok kèm #${list.integrationKey} để lead chảy về tệp này`">
                #{{ list.integrationKey }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <span v-if="list.shareableToPool" class="share-chip" title="Tệp này đã chia sẻ vào Lead Pool — sale có quyền có thể nhận lead">
                <v-icon size="11">mdi-account-multiple</v-icon> Pool
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td class="date">{{ formatDate(list.createdAt) }}</td>
            <td class="num-cell">{{ list.totalEntries.toLocaleString('vi-VN') }}</td>
            <td class="num-cell green">{{ list.validEntries.toLocaleString('vi-VN') }}</td>
            <td class="num-cell" :class="dupTotal(list) > 0 ? 'amber' : 'muted'">{{ dupTotal(list).toLocaleString('vi-VN') }}</td>
            <td class="num-cell" :class="list.hasZaloEntries > 0 ? 'blue' : 'muted'">
              <template v-if="list.status === 'processing' && list.pendingLookupEntries > 0">
                <span class="muted">— /{{ list.validEntries.toLocaleString('vi-VN') }}</span>
              </template>
              <template v-else>
                {{ list.hasZaloEntries.toLocaleString('vi-VN') }}
              </template>
            </td>
            <td class="progress-cell">
              <div class="progress-bar" :title="`Hợp lệ ${progressPct(list, 'valid')}% · Lỗi ${progressPct(list, 'invalid')}% · Trùng ${progressPct(list, 'dup')}%`">
                <i class="ok" :style="{ width: progressPct(list, 'valid') + '%' }"></i>
                <i class="warn" :style="{ width: progressPct(list, 'dup') + '%' }"></i>
                <i class="bad" :style="{ width: progressPct(list, 'invalid') + '%' }"></i>
              </div>
            </td>
            <td>
              <span v-if="list.status === 'processing'" class="status-chip processing">
                <v-icon size="12">mdi-progress-clock</v-icon> Đang quét
              </span>
              <span v-else-if="list.status === 'archived'" class="status-chip archived">
                <v-icon size="12">mdi-archive</v-icon> Lưu trữ
              </span>
              <span v-else class="status-chip done">
                <v-icon size="12">mdi-check-circle</v-icon> Hoàn tất
              </span>
            </td>
            <td class="row-actions" @click.stop>
              <button class="icon-btn" title="Tạo campaign từ tệp này">
                <v-icon size="14">mdi-send</v-icon>
              </button>
              <button class="icon-btn" title="Export CSV">
                <v-icon size="14">mdi-download</v-icon>
              </button>
              <v-menu :close-on-content-click="true">
                <template #activator="{ props: act }">
                  <button v-bind="act" class="icon-btn" title="More">
                    <v-icon size="14">mdi-dots-vertical</v-icon>
                  </button>
                </template>
                <v-list density="compact" min-width="180">
                  <v-list-item @click="onRescan(list.id)" prepend-icon="mdi-refresh">
                    <v-list-item-title>Quét lại Zalo</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    v-if="list.archivedAt"
                    @click="onUnarchive(list.id)"
                    prepend-icon="mdi-archive-arrow-up-outline"
                  >
                    <v-list-item-title>Đưa khỏi lưu trữ</v-list-item-title>
                  </v-list-item>
                  <v-list-item
                    v-else
                    @click="onArchive(list.id)"
                    prepend-icon="mdi-archive-outline"
                  >
                    <v-list-item-title>Lưu trữ</v-list-item-title>
                  </v-list-item>
                  <v-divider />
                  <v-list-item @click="onDelete(list.id)" prepend-icon="mdi-delete-outline" class="danger">
                    <v-list-item-title style="color: var(--error, #f04438)">Xoá tệp</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <CreateListModal v-model="showCreate" @created="onCreated" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useCustomerLists, type CustomerListSummary, type ListStatusFilter } from '@/composables/use-customer-lists';
import { formatInOrgTz } from '@/composables/use-org-timezone';
import CreateListModal from '@/components/automation/lists/CreateListModal.vue';
import '@/components/automation/phase7/airtable.css';

// Phase Multi-Source Lead Ads 2026-05-27 — platform filter
type PlatformFilter = 'all' | 'leadads' | 'paste';
const platformFilter = ref<PlatformFilter>('all');

function onPlatformFilter(p: PlatformFilter) {
  platformFilter.value = p;
}

const router = useRouter();
const {
  lists,
  listsTotal,
  loadingLists,
  listsStatus,
  listsSearch,
  fetchLists,
  archiveList,
  unarchiveList,
  rescanZalo,
  deleteList,
} = useCustomerLists();

const showCreate = ref(false);

onMounted(() => fetchLists());

function onSwitchStatus(s: ListStatusFilter) {
  listsStatus.value = s;
  fetchLists();
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedFetch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fetchLists(), 300);
}

function goToDetail(id: string) {
  router.push(`/marketing/lists/${id}`);
}

function onCreated(payload: { id: string }) {
  // Navigate to detail of newly created list
  router.push(`/marketing/lists/${payload.id}`);
}

async function onArchive(id: string) {
  if (!confirm('Lưu trữ tệp này? Tệp sẽ ẩn khỏi danh sách "Đang dùng" nhưng dữ liệu vẫn còn.')) return;
  await archiveList(id);
}

async function onUnarchive(id: string) {
  await unarchiveList(id);
}

async function onRescan(id: string) {
  const result = await rescanZalo(id);
  if (result?.ok) {
    alert(`Đã bắt đầu quét lại ${result.pendingLookup} SĐT. Refresh sau vài phút.`);
  }
}

async function onDelete(id: string) {
  if (!confirm('Xoá vĩnh viễn tệp này? Contact đã được tạo từ tệp sẽ KHÔNG bị xoá theo.')) return;
  await deleteList(id);
}

// ───────── Helpers ─────────
function formatDate(iso: string): string {
  return formatInOrgTz(iso);
}

function sourceLabel(s: string): string {
  switch (s) {
    case 'paste': return '📋 Paste';
    case 'csv': return '📄 CSV';
    case 'excel': return '📊 Excel';
    case 'leadads': return '📣 Lead Ads';
    case 'api': return '🔌 API';
    default: return s;
  }
}

// Phase Multi-Source Lead Ads 2026-05-27 — pill color theo source kind
function sourceClass(s: string): string {
  if (s === 'leadads' || s === 'api') return 'source-leadads';
  return 'source-import';
}

const filteredLists = computed(() => {
  if (platformFilter.value === 'all') return lists.value;
  if (platformFilter.value === 'leadads') {
    return lists.value.filter((l) => l.sourceType === 'leadads' || l.sourceType === 'api');
  }
  if (platformFilter.value === 'paste') {
    return lists.value.filter((l) => l.sourceType === 'paste' || l.sourceType === 'csv' || l.sourceType === 'excel');
  }
  return lists.value;
});

const stats = computed(() => {
  let leadAdsLists = 0, pasteLists = 0;
  let totalEntries = 0, totalHasZalo = 0;
  for (const l of lists.value) {
    if (l.sourceType === 'leadads' || l.sourceType === 'api') leadAdsLists++;
    else pasteLists++;
    totalEntries += l.totalEntries;
    totalHasZalo += l.hasZaloEntries;
  }
  return {
    totalLists: lists.value.length,
    leadAdsLists,
    pasteLists,
    totalEntries,
    totalHasZalo,
  };
});

function dupTotal(l: CustomerListSummary): number {
  return l.dupInListEntries + l.dupCrossListEntries + l.dupWithContactEntries;
}

function progressPct(l: CustomerListSummary, kind: 'valid' | 'invalid' | 'dup'): number {
  if (l.totalEntries === 0) return 0;
  if (kind === 'valid') {
    const validOnly = l.validEntries - dupTotal(l);
    return Math.max(0, (validOnly / l.totalEntries) * 100);
  }
  if (kind === 'invalid') return (l.invalidEntries / l.totalEntries) * 100;
  if (kind === 'dup') return (dupTotal(l) / l.totalEntries) * 100;
  return 0;
}

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const GRADIENTS: [string, string][] = [
  ['#6366F1', '#A855F7'],
  ['#10B981', '#059669'],
  ['#F59E0B', '#D97706'],
  ['#EC4899', '#BE185D'],
  ['#3B82F6', '#1D4ED8'],
];
function hashIdx(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}
function avatarStyle(name: string): Record<string, string> {
  const [c1, c2] = GRADIENTS[hashIdx(name || '?', GRADIENTS.length)];
  return { background: `linear-gradient(135deg, ${c1}, ${c2})` };
}
void initials; void avatarStyle; // legacy helpers kept for ref after table refactor
</script>

<style scoped>
.lists-view {
  /* 2026-06-04 v2 — Unified Marketing theme */
  padding: var(--at-s-lg, 24px);
  max-width: 100%;
}

/* HS re-skin 2026-06-05 — ListsView hardcode Tailwind-gray → token HS Holding.
   CSS-only, template/logic giữ nguyên. Tab active dùng --ink (navy) như
   .at-primary, action/stat-card active dùng --brand. */
.status-tabs {
  display: flex; align-items: center; gap: 4px;
  background: var(--surface, #fff); border: 1px solid var(--line, #e7eaf0); border-radius: 10px;
  padding: 6px; margin-bottom: 14px;
}
.status-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  font-size: 12.5px; font-weight: 500; color: var(--ink-2, #475066);
  font-family: inherit;
}
.status-tab:hover { background: var(--surface-3, #f1f4f9); color: var(--ink, #141a24); }
.status-tab.active { background: var(--ink, #141a24); color: #fff; }
.status-tab .count {
  background: rgba(20,26,36,.06); color: var(--ink-2, #475066);
  padding: 0 6px; border-radius: 99px;
  font-size: 10.5px; font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.status-tab.active .count {
  background: rgba(255,255,255,.18); color: #fff;
}
.spacer { flex: 1; }
.search {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--surface-3, #f1f4f9); border: 1px solid var(--line-2, #eef1f6);
  border-radius: 7px; padding: 0 9px;
  min-width: 220px; height: 32px;
}
.search input {
  border: none; background: transparent; outline: none;
  font-size: 12.5px; color: var(--ink, #141a24);
  font-family: inherit; width: 100%;
}
.search input::placeholder { color: var(--ink-4, #97a0b3); }

.empty-state {
  background: var(--surface, #fff); border: 1px solid var(--line, #e7eaf0);
  border-radius: 12px; padding: 64px 24px;
  text-align: center; color: var(--ink-3, #6b7488);
}
.empty-state .empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-state h3 { margin: 0 0 8px; color: var(--ink, #141a24); font-size: 16px; }
.empty-state p { margin: 0; font-size: 13px; }

.lists-table-wrap {
  background: var(--surface, #fff); border: 1px solid var(--line, #e7eaf0);
  border-radius: 10px; overflow: auto;
}
.lists-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.lists-table thead th {
  background: var(--surface-3, #f1f4f9);
  font-size: 10.5px; font-weight: 600; color: var(--ink-3, #6b7488);
  text-transform: uppercase; letter-spacing: .04em;
  padding: 10px 10px; text-align: left;
  border-bottom: 1px solid var(--line, #e7eaf0); white-space: nowrap;
}
.lists-table thead th.right { text-align: right; }
.lists-table tbody td {
  padding: 11px 10px;
  border-bottom: 1px solid var(--line-2, #eef1f6);
  vertical-align: middle; color: var(--ink, #141a24);
}
.lists-table tbody tr.row-clickable { cursor: pointer; transition: background .1s; }
.lists-table tbody tr.row-clickable:hover { background: var(--brand-softer, #f2f8fc); }
.lists-table tbody tr:last-child td { border-bottom: none; }

.list-name-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.list-name-cell .icon-em { font-size: 18px; flex-shrink: 0; }
.list-name-cell .nm { font-weight: 600; color: var(--ink, #141a24); font-size: 13px; }
.list-name-cell .sub { font-size: 11px; color: var(--ink-3, #6b7488); margin-top: 1px; }

.date { color: var(--ink-2, #475066); font-size: 12px; white-space: nowrap; }

.author-cell { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2, #475066); font-size: 12px; }
.author-cell .av {
  width: 22px; height: 22px; border-radius: 50%;
  color: #fff; font-size: 10px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.source-chip {
  display: inline-flex; align-items: center;
  font-size: 11px; color: var(--ink-3, #6b7488);
  background: var(--surface-3, #f1f4f9); padding: 2px 7px; border-radius: 5px;
}

.num-cell {
  font-family: "Roboto Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  font-size: 13px; font-weight: 600;
  font-variant-numeric: tabular-nums; text-align: right;
}
.num-cell.green { color: #157f3c; }
.num-cell.red { color: #b42318; }
.num-cell.amber { color: #b45309; }
.num-cell.blue { color: var(--brand-700, #0b5880); }
.num-cell.muted { color: var(--ink-4, #97a0b3); font-weight: 400; }

.progress-cell { min-width: 120px; }
.progress-bar {
  display: flex; height: 6px; border-radius: 99px;
  overflow: hidden; background: var(--surface-3, #f1f4f9);
}
.progress-bar > i { display: block; height: 100%; }
.progress-bar .ok { background: var(--success, #12b76a); }
.progress-bar .warn { background: var(--warning, #f5a524); }
.progress-bar .bad { background: var(--error, #f04438); }

.status-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 99px;
  font-size: 10.5px; font-weight: 600; white-space: nowrap;
}
.status-chip.done { background: var(--success-soft, #e7f7ef); color: #157f3c; }
.status-chip.processing { background: var(--warning-soft, #fdf3e2); color: #b45309; }
.status-chip.archived { background: var(--surface-3, #f1f4f9); color: var(--ink-2, #475066); }

.row-actions { text-align: right; white-space: nowrap; }
.icon-btn {
  width: 26px; height: 26px; border-radius: 5px;
  border: none; background: transparent; color: var(--ink-3, #6b7488);
  cursor: pointer; margin-left: 2px;
  display: inline-flex; align-items: center; justify-content: center;
}
.icon-btn:hover { background: var(--surface-3, #f1f4f9); color: var(--ink, #141a24); }

/* ───── Phase Multi-Source Lead Ads 2026-05-27 ───── */
.stats-row {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
  margin-bottom: 12px;
}
.stat-card {
  background: var(--surface, #fff); border: 1px solid var(--line, #e7eaf0); border-radius: 10px;
  padding: 12px 14px; text-align: left; cursor: pointer;
  font-family: inherit; transition: all 120ms;
}
.stat-card:hover { border-color: var(--brand-soft, #cfe6f3); }
.stat-card.active { border-color: var(--brand, #1786be); background: var(--brand-softer, #f2f8fc); }
.stat-card-readonly { cursor: default; }
.stat-card-readonly:hover { border-color: var(--line, #e7eaf0); }
.stat-num {
  font-size: 22px; font-weight: 700; color: var(--ink, #141a24);
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.stat-label { font-size: 11px; color: var(--ink-3, #6b7488); margin-top: 4px; }

.source-chip.source-leadads {
  background: var(--warning-soft, #fdf3e2); color: #92400e; border: 1px solid #f1c97a;
}
.source-chip.source-import {
  background: var(--brand-soft, #e4f1f8); color: var(--brand-700, #0b5880); border: 1px solid #9fcfe7;
}
.key-chip {
  display: inline-flex; align-items: center; padding: 2px 8px;
  font-family: "Roboto Mono", 'Courier New', monospace; font-weight: 600;
  font-size: 11px; background: var(--surface-3, #f1f4f9); color: var(--ink, #141a24);
  border-radius: 4px; letter-spacing: .5px;
}
.key-chip.unrouted {
  background: #fdeceb; color: #b42318;
}
.share-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11px; padding: 2px 7px; border-radius: 99px;
  background: var(--success-soft, #e7f7ef); color: #157f3c; font-weight: 500;
}
.muted { color: var(--ink-4, #97a0b3); font-size: 12px; }
</style>
