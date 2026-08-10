<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <aside class="chat-action-rail">
    <button class="rail-action active" title="Hội thoại" type="button">
      <v-icon size="20">mdi-message-text-outline</v-icon>
    </button>

    <v-menu v-model="friendMenu" location="end top" :close-on-content-click="false" @update:model-value="onFriendMenu">
      <template #activator="{ props: act }">
        <button v-bind="act" class="rail-action" title="Lời mời kết bạn" type="button">
          <v-icon size="20">mdi-account-outline</v-icon>
          <span v-if="friendTotal" class="rail-badge">{{ friendTotal > 99 ? '99+' : friendTotal }}</span>
        </button>
      </template>
      <v-card class="friend-popup" width="420" max-height="560">
        <v-card-title class="popup-head">
          <span>Lời mời kết bạn</span>
          <v-btn icon="mdi-refresh" variant="text" size="small" :loading="friendLoading" @click="loadFriendRequests" />
        </v-card-title>
        <v-divider />
        <div v-if="friendLoading && !friendRequests.length" class="popup-state">Đang tải…</div>
        <div v-else-if="!friendRequests.length" class="popup-state">Không có lời mời đang chờ</div>
        <v-list v-else lines="two" class="friend-list">
          <v-list-item v-for="friend in friendRequests" :key="friend.id">
            <template #prepend>
              <v-avatar size="40"><v-img v-if="friend.zaloAvatarUrl || friend.contact?.avatarUrl" :src="friend.zaloAvatarUrl || friend.contact?.avatarUrl || undefined" /><v-icon v-else>mdi-account</v-icon></v-avatar>
            </template>
            <v-list-item-title>{{ friend.aliasInNick || friend.zaloDisplayName || friend.contact?.crmName || friend.contact?.fullName || 'Người dùng Zalo' }}</v-list-item-title>
            <v-list-item-subtitle>{{ friend.zaloAccount?.displayName || 'Nick Zalo' }} · {{ formatTime(friend.updatedAt) }}</v-list-item-subtitle>
            <template #append>
              <div class="friend-actions">
                <v-btn size="small" color="primary" variant="flat" :loading="busyId === friend.id" @click="respond(friend, 'accept')">Đồng ý</v-btn>
                <v-btn size="small" variant="text" :disabled="busyId === friend.id" @click="respond(friend, 'reject')">Từ chối</v-btn>
              </div>
            </template>
          </v-list-item>
        </v-list>
        <v-card-actions v-if="friendTotal > friendRequests.length" class="justify-center">
          <v-btn variant="text" :loading="friendLoading" @click="loadFriendRequests(friendPage + 1)">Xem thêm</v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>

    <button class="rail-action" title="Đơn thiết kế" type="button" @click="router.push('/orders')">
      <v-icon size="20">mdi-palette-outline</v-icon>
    </button>

    <v-menu v-model="tabMenu" location="end" :close-on-content-click="true">
      <template #activator="{ props: act }">
        <button v-bind="act" class="rail-action" :class="{ selected: activeTab !== 'all' }" title="Lọc loại hội thoại" type="button">
          <v-icon size="20">mdi-email-outline</v-icon>
        </button>
      </template>
      <v-list density="compact" min-width="180">
        <v-list-item v-for="tab in tabs" :key="tab.key" :active="activeTab === tab.key" :title="tab.label" @click="$emit('select-tab', tab.key)">
          <template #prepend><v-icon size="18">{{ tab.icon }}</v-icon></template>
        </v-list-item>
      </v-list>
    </v-menu>

    <v-menu v-model="dateMenu" location="end" :close-on-content-click="false">
      <template #activator="{ props: act }">
        <button v-bind="act" class="rail-action" :class="{ selected: dateFrom || dateTo }" title="Lọc theo tin khách gửi cuối" type="button">
          <v-icon size="20">mdi-clock-outline</v-icon>
          <span v-if="dateFrom || dateTo" class="filter-dot" />
        </button>
      </template>
      <v-card class="date-popup" width="310">
        <v-card-title>Lọc tin khách gửi cuối</v-card-title>
        <v-card-text>
          <label>Từ ngày<input v-model="draftFrom" type="date" /></label>
          <label>Đến ngày<input v-model="draftTo" type="date" /></label>
          <div class="date-presets">
            <v-btn size="small" variant="tonal" @click="setPreset('today')">Hôm nay</v-btn>
            <v-btn size="small" variant="tonal" @click="setPreset('7d')">7 ngày</v-btn>
            <v-btn size="small" variant="tonal" @click="setPreset('month')">Tháng này</v-btn>
            <v-btn size="small" variant="tonal" @click="setPreset('year')">Năm nay</v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="clearDates">Xóa lọc</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="applyDates">Áp dụng</v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>

    <button class="rail-action disabled" title="Lịch trình — chưa gán" type="button"><v-icon size="20">mdi-calendar-month-outline</v-icon></button>
    <button class="rail-action disabled" title="Tài liệu — chưa gán" type="button"><v-icon size="20">mdi-file-document-multiple-outline</v-icon></button>
    <button class="rail-action" :class="{ selected: statisticsOpen }" title="Thống kê hoạt động Zalo" type="button" @click="statisticsOpen = true"><v-icon size="20">mdi-chart-bar</v-icon></button>
    <ZaloStatisticsDialog v-model="statisticsOpen" :account-ids="accountIds" />
  </aside>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';
import type { ActiveTab } from '@/composables/use-inbox-filters';
import ZaloStatisticsDialog from './ZaloStatisticsDialog.vue';

type FriendRequest = {
  id: string; zaloAccountId: string; zaloUidInNick: string; updatedAt: string;
  aliasInNick?: string | null; zaloDisplayName?: string | null; zaloAvatarUrl?: string | null;
  contact?: { fullName?: string | null; crmName?: string | null; avatarUrl?: string | null } | null;
  zaloAccount?: { displayName?: string | null } | null;
};

type LiveFriendRequest = {
  userId: string; displayName?: string | null; avatar?: string | null; phone?: string | null;
  message?: string | null; requestedAt?: string | null; isSeen?: boolean;
};
const props = defineProps<{ activeTab: ActiveTab; accountIds: string[]; dateFrom: string; dateTo: string }>();
const emit = defineEmits<{ 'select-tab': [tab: ActiveTab]; 'apply-date': [value: { from: string; to: string }] }>();
const router = useRouter();
const toast = useToast();
const friendMenu = ref(false), tabMenu = ref(false), dateMenu = ref(false), statisticsOpen = ref(false);
const friendRequests = ref<FriendRequest[]>([]), friendTotal = ref(0), friendPage = ref(1), friendLoading = ref(false), busyId = ref('');
const draftFrom = ref(props.dateFrom), draftTo = ref(props.dateTo);
watch(() => [props.dateFrom, props.dateTo], ([from, to]) => { draftFrom.value = from; draftTo.value = to; });
onMounted(() => { void loadFriendRequests(); });
watch(() => props.accountIds.join(','), () => { void loadFriendRequests(); });

const tabs: Array<{ key: ActiveTab; label: string; icon: string }> = [
  { key: 'all', label: 'Tất cả', icon: 'mdi-inbox-multiple-outline' }, { key: 'personal', label: 'Cá nhân', icon: 'mdi-account-outline' },
  { key: 'group', label: 'Nhóm', icon: 'mdi-account-group-outline' }, { key: 'main', label: 'Chính', icon: 'mdi-inbox-outline' },
  { key: 'other', label: 'Ưu tiên', icon: 'mdi-star-outline' },
];

function onFriendMenu(open: boolean) { if (open) void loadFriendRequests(); }
async function loadFriendRequests(page = 1) {
  friendLoading.value = true;
  try {
    // Đọc trực tiếp Zalo cho từng nick. DB pending_received chỉ có khi listener bắt được
    // event; popup phải phản ánh cùng danh sách đang thấy trên Zalo điện thoại.
    const batches = await Promise.allSettled(
      props.accountIds.map(async (accountId) => {
        const { data } = await api.get(`/zalo-accounts/${accountId}/friends/requests/received`);
        return (data.data ?? []).map((req: LiveFriendRequest): FriendRequest => ({
          id: `${accountId}:${req.userId}`,
          zaloAccountId: accountId,
          zaloUidInNick: req.userId,
          updatedAt: req.requestedAt || new Date().toISOString(),
          zaloDisplayName: req.displayName || null,
          zaloAvatarUrl: req.avatar || null,
          zaloAccount: { displayName: null },
        }));
      }),
    );
    const rows = batches.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const visibleCount = page * 20;
    friendRequests.value = rows.slice(0, visibleCount);
    friendTotal.value = rows.length;
    friendPage.value = page;
    if (batches.some((result) => result.status === 'rejected')) {
      toast.error('Một số nick Zalo không tải được lời mời');
    }
  } catch { toast.error('Không tải được lời mời kết bạn'); }
  finally { friendLoading.value = false; }
}async function respond(friend: FriendRequest, action: 'accept' | 'reject') {
  busyId.value = friend.id;
  try {
    await api.post(`/zalo-accounts/${friend.zaloAccountId}/friends/requests/${encodeURIComponent(friend.zaloUidInNick)}/${action}`);
    friendRequests.value = friendRequests.value.filter(row => row.id !== friend.id);
    friendTotal.value = Math.max(0, friendTotal.value - 1);
    toast.success(action === 'accept' ? 'Đã đồng ý kết bạn' : 'Đã từ chối lời mời');
  } catch (err: any) { toast.error(err?.response?.data?.error || 'Không xử lý được lời mời'); }
  finally { busyId.value = ''; }
}
function localDate(d: Date) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function setPreset(kind: 'today'|'7d'|'month'|'year') {
  const end = new Date(), start = new Date(end);
  if (kind === '7d') start.setDate(end.getDate() - 6);
  if (kind === 'month') start.setDate(1);
  if (kind === 'year') { start.setMonth(0); start.setDate(1); }
  draftFrom.value = localDate(start); draftTo.value = localDate(end);
}
function applyDates() { emit('apply-date', { from: draftFrom.value, to: draftTo.value }); dateMenu.value = false; }
function clearDates() { draftFrom.value=''; draftTo.value=''; applyDates(); }
function formatTime(value: string) { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
</script>

<style scoped>
.chat-action-rail{background:linear-gradient(180deg,#1060C8 0%,#0B4FA8 100%);display:flex;flex-direction:column;align-items:center;padding:16px 0;gap:8px;border-right:0;height:100%}.rail-action{position:relative;width:40px;height:40px;border:0;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#FFFFFF;cursor:pointer;background:transparent;transition:.15s}.rail-action:hover,.rail-action.selected{background:rgba(255,255,255,.14);color:#FFFFFF}.rail-action.active{background:rgba(255,255,255,.22);color:#FFFFFF;font-weight:700}.rail-action.disabled{cursor:default;opacity:.55}.rail-badge{position:absolute;right:-4px;top:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#EF4444;color:#fff;font-size:10px;line-height:17px}.filter-dot{position:absolute;right:6px;top:6px;width:7px;height:7px;border-radius:50%;background:#2F80ED}.popup-head{display:flex;justify-content:space-between;align-items:center;font-size:16px}.popup-state{padding:32px;text-align:center;color:#6B7280}.friend-list{max-height:470px;overflow:auto}.friend-actions{display:flex;gap:3px;align-items:center}.date-popup label{display:block;font-size:12px;color:#4B5563;margin-bottom:12px}.date-popup input{display:block;width:100%;margin-top:5px;padding:8px;border:1px solid #D1D5DB;border-radius:7px}.date-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
</style>
