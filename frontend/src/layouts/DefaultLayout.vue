<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <v-app class="smax-app">
    <!-- ════════ TOP NAV — Nhà Yến teal-navy shell (redesign 2026-06-05, đảo lock Variant A) ════════ -->
    <!-- Gradient teal-navy + monogram HS + wordmark · 7 tab + Báo cáo + Cài đặt · MDI line icon · active HS -->
    <header class="smax-topnav">
      <RouterLink to="/" class="header-wordmark" title="Nhà Yến CRM">
        <img src="/brand/brand-lockup-horizontal.png" alt="Nhà Yến CRM" />
      </RouterLink>
      <!-- If on Chat route, show back button and Zalo account name instead of brand logo and title -->
      <div v-if="route.path.startsWith('/chat')" class="chat-header-back-section">
        <button class="back-to-select-btn" @click="router.push('/select-account')" title="Trở về trang chọn tài khoản">
          <v-icon size="20" class="mr-1">mdi-chevron-left</v-icon>
          <span class="back-account-name">{{ activeAccountName }}</span>
        </button>
      </div>

<!-- Primary nav tabs -->
      <nav class="nav-tabs">
        <template v-for="tab in visiblePrimaryTabs" :key="tab.path">
          <!-- 1. Nút có subItems con → v-menu open-on-hover -->
          <v-menu v-if="tab.subItems && tab.subItems.length > 0" open-on-hover :close-on-content-click="true">
            <template #activator="{ props: act }">
              <RouterLink
                :to="tab.path"
                class="nav-tab"
                :class="{ active: isActive(tab) }"
                v-bind="act"
              >
                <v-icon :icon="tab.icon" size="16" class="ic-svg" />{{ tab.label }}
              </RouterLink>
            </template>
            <v-list density="compact" min-width="220" class="nav-dropdown-list">
              <v-list-subheader>{{ tab.label }}</v-list-subheader>
              <template v-for="sub in tab.subItems" :key="sub.path + (sub.action || '')">
                <v-list-item
                  v-if="!sub.resource || authStore.canAccess(sub.resource, sub.action || 'access')"
                  :to="sub.path"
                  :title="sub.label"
                  :prepend-icon="sub.icon"
                />
              </template>
            </v-list>
          </v-menu>

          <!-- 2. Nút đơn thường (Dashboard, Tin nhắn) -->
          <RouterLink
            v-else
            :to="tab.path"
            class="nav-tab"
            :class="{ active: isActive(tab) }"
          >
            <v-icon :icon="tab.icon" size="16" class="ic-svg" />{{ tab.label }}
          </RouterLink>
        </template>

        <!-- Báo cáo dropdown — gộp Phân tích + Báo cáo (anh chốt 2026-05-28).
             RBAC: chỉ hiện cho ai có engagement_score (Sale Senior trở lên).
             2026-06-09 (anh báo menu bar kẹt không click được, phải F5): đổi
             open-on-hover → CLICK + v-model điều khiển. Hover race + click item bị
             chặn quyền làm overlay (z-index 2000) kẹt mở, phủ lên nav nuốt click.
             router.afterEach đóng hết menu. -->
        <v-menu v-if="authStore.canAccess('engagement_score')" v-model="reportsMenu" :close-on-content-click="true">
          <template #activator="{ props: act }">
            <button class="nav-tab" :class="{ active: isReportsActive }" v-bind="act">
              <v-icon icon="mdi-chart-box-outline" size="16" class="ic-svg" />Báo cáo<span class="caret">▾</span>
            </button>
          </template>
          <!-- Module Báo cáo 7 màn (2026-06-17) — liệt kê trực tiếp cho dễ vào. -->
          <v-list density="compact" min-width="236">
            <v-list-subheader>Báo cáo</v-list-subheader>
            <v-list-item to="/reports/tong-quan"  title="Tổng quan điều hành"   prepend-icon="mdi-view-dashboard-outline" />
            <v-list-item to="/reports/nick"        title="Vận hành Nick Zalo"    prepend-icon="mdi-cellphone-link" />
            <v-list-item to="/reports/sale"        title="Hiệu suất Sale & Team" prepend-icon="mdi-account-tie-outline" />
            <!-- EE-only: Pipeline (Lead Pool) + Automation report là tính năng Extension.
                 Ẩn ở Community (route /reports/automation do EE inject → CE không có). -->
            <v-list-item v-if="isExtension" to="/reports/pipeline"    title="Pipeline & Lead Pool"  prepend-icon="mdi-filter-variant" />
            <v-list-item v-if="isExtension" to="/reports/automation"  title="Automation & Chăm sóc" prepend-icon="mdi-cog-sync-outline" />
            <v-list-item to="/reports/audit"       title="Audit & Sức khỏe HT"   prepend-icon="mdi-shield-check-outline" />
            <v-divider />
            <v-list-item to="/analytics" title="Phân tích nâng cao" prepend-icon="mdi-chart-line" />
          </v-list>
        </v-menu>

        <!-- Cài đặt dropdown -->
        <v-menu v-model="settingsMenu" :close-on-content-click="true">
          <template #activator="{ props: act }">
            <button class="nav-tab" :class="{ active: isSettingsActive }" v-bind="act">
              <v-icon icon="mdi-cog-outline" size="16" class="ic-svg" />Cài đặt<span class="caret">▾</span>
            </button>
          </template>
          <!-- Dropdown = LỐI TẮT (2026-06-10 CEO-review): 7 mục hay dùng, route mới
               đồng bộ sidebar (bỏ /settings/team/* legacy + Tag cũ). Lọc theo grants.
               Đầy đủ menu ở "Xem tất cả cài đặt". -->
          <v-list density="compact" min-width="248">
            <v-list-subheader>Lối tắt hay dùng</v-list-subheader>
            <v-list-item to="/settings/personal/profile" title="Hồ sơ của tôi" prepend-icon="mdi-account-outline" />
            <v-list-item v-if="authStore.canAccess('user')" to="/settings/rbac/users" title="Nhân viên" prepend-icon="mdi-account-group-outline" />
            <v-list-item v-if="authStore.canAccess('permission_group')" to="/settings/rbac/permission-groups" title="Phân quyền" prepend-icon="mdi-shield-account-outline" />
            <v-divider />
            <v-list-item v-if="authStore.canAccess('zalo_account')" to="/settings/channels/zalo" title="Tài khoản Zalo" prepend-icon="mdi-cellphone-link" />
            <v-list-item v-if="authStore.canAccess('settings')" to="/settings/crm/tags-v2" title="Nhãn KH" prepend-icon="mdi-tag-multiple-outline" />
            <v-list-item v-if="authStore.canAccess('settings')" to="/settings/crm/quick-replies" title="Hỗ trợ trả lời" prepend-icon="mdi-message-flash-outline" />
            <v-list-item v-if="authStore.canAccess('settings')" to="/settings/org/system-notifications" title="Thông báo hệ thống" prepend-icon="mdi-bell-cog-outline" />
            <!-- Open-core: extension top-nav shortcuts (empty in Community edition). -->
            <template v-for="sc in eeTopNavShortcuts" :key="sc.to">
              <v-list-item v-if="authStore.canAccess(sc.resource)" :to="sc.to" :title="sc.title" :prepend-icon="sc.icon" />
            </template>
            <v-divider />
            <v-list-item to="/settings" title="Xem tất cả cài đặt" prepend-icon="mdi-cog-outline" />
          </v-list>
        </v-menu>
      </nav>

      <!-- Trình chọn sử dụng Zalo riêng biệt (đổi scope xem Zalo) -->
      <v-menu v-model="zaloMenu" :close-on-content-click="true">
        <template #activator="{ props: act }">
          <button class="zalo-scope-picker" v-bind="act" title="Chọn tài khoản Zalo đang làm việc">
            <v-avatar size="24" class="mr-2 rounded border" color="#F3F4F6">
              <v-img v-if="activeAccountAvatar" :src="activeAccountAvatar || undefined" cover />
              <v-icon v-else size="14" color="#6B7280">mdi-cellphone-link</v-icon>
            </v-avatar>
            <span class="zalo-scope-name">{{ activeAccountName }}</span>
            <span class="caret">▾</span>
          </button>
        </template>
        <v-list density="compact" min-width="260">
          <v-list-item
            title="Bảng điều khiển"
            prepend-icon="mdi-apps"
            to="/select-account"
          />
          <v-divider />
          <v-list-item
            title="Tất cả tài khoản"
            prepend-icon="mdi-earth"
            :class="{ 'zalo-item-active': !currentScopeId }"
            @click="selectZaloAccount(null)"
          />
          <v-divider />
          <v-list-item
            v-for="acc in zaloAccounts"
            :key="acc.id"
            :title="acc.displayName || ''"
            :subtitle="acc.phone || acc.id"
            :class="{ 'zalo-item-active': currentScopeId === acc.id }"
            @click="selectZaloAccount(acc.id)"
          >
            <template #prepend>
              <v-avatar size="24" class="mr-2 rounded border">
                <v-img :src="acc.avatarUrl || undefined" cover />
              </v-avatar>
            </template>
          </v-list-item>
        </v-list>
      </v-menu>

      <!-- Flexible spacer pushes everything after it to the right edge. -->
      <div class="topnav-spacer" />

      <!--
        ATTRIBUTION BANNER — moved into DashboardView per copyright holder
        (locnt@locnguyendata.com). Rendering still required by Apache 2.0 §4(d);
        see src/views/DashboardView.vue and src/composables/use-attribution.ts.
      -->

      <!-- Global search trigger — Đã ẩn theo yêu cầu -->

      <!-- Right icon buttons -->
      <!-- 2026-06-13 (anh chốt): nút này trỏ về trang quản lý nick Zalo (trước trỏ /groups). -->
      <RouterLink to="/settings/channels/zalo" class="icon-btn" title="Quản lý nick Zalo">
        <v-icon size="18">mdi-cellphone-link</v-icon>
      </RouterLink>

      <NotificationBell class="icon-btn-wrap" />

      <v-menu v-model="userMenu" :close-on-content-click="true">
        <template #activator="{ props: act }">
          <button class="user-avatar" v-bind="act" :title="authStore.user?.fullName || 'Tài khoản'">
            <Avatar :src="authStore.user?.avatarUrl" :name="authStore.user?.fullName || 'U'" :size="32" :platform="null" />
          </button>
        </template>
        <v-list density="compact" min-width="200">
          <v-list-item :title="authStore.user?.fullName || ''" :subtitle="authStore.user?.email || ''" />
          <v-divider />
          <!-- 2026-06-13 (anh chốt): Hồ sơ trỏ về trang gom "Tài khoản của tôi". Bỏ nút Theme tối. -->
          <v-list-item to="/settings/personal/profile" title="Hồ sơ" prepend-icon="mdi-account-circle-outline" />
          <v-divider />
          <v-list-item @click="logout" title="Đăng xuất" prepend-icon="mdi-logout" />
        </v-list>
      </v-menu>
    </header>

    <!-- Phase Internal Contact 2-method 2026-05-23 — banner persistent nếu sale chưa setup -->
    <div v-if="showInternalContactBanner" class="ic-banner">
      <span class="ic-banner-icon">⚠</span>
      <div class="ic-banner-text">
        <strong>Bạn đang BỎ LỠ thông báo quan trọng từ CRM!</strong>
        <span class="ic-banner-sub">Khách đồng ý kết bạn, cảnh báo silent 30 ngày, lịch hẹn, daily KPI...</span>
      </div>
      <button class="ic-banner-cta" @click="goSetupInternalContact">⚙ Thiết lập ngay</button>
      <button class="ic-banner-dismiss" @click="dismissInternalContactBanner" title="Ẩn 24h">✕</button>
    </div>

    <!-- ════════ MAIN ════════ -->
    <v-main class="smax-main">
      <slot />
    </v-main>

    <!-- 2026-06-04: Anh chốt gỡ MiniOnboardingIndicator — badge 4/4 hiện đè
         mọi UI gây rối mắt sau khi sale hoàn tất. Sẽ code lại setup 4 bước. -->

    <!-- 2026-06-01: LeadFloatingButton moved → ConversationFilterSidebar (chỉ render trong /chat).
         Floating bottom-right bị bỏ. Sale thấy nút "Nhận khách" trong sidebar cột 1 (expanded card / collapsed icon hộp quà pulse). -->

    <!-- Global toast queue -->
    <ToastContainer />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useTheme } from 'vuetify';
import { useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { isExtension } from '@ee/edition';
import { useRouter } from 'vue-router';
import NotificationBell from '@/components/NotificationBell.vue';
import ToastContainer from '@/components/ui/ToastContainer.vue';
import Avatar from '@/components/ui/Avatar.vue';
// Open-core: extension top-nav shortcuts (empty in Community edition via @ee stub).
import { eeTopNavShortcuts } from '@ee/nav';
// 2026-06-04: gỡ MiniOnboardingIndicator (Anh chốt code lại setup 4 bước sau)
// LeadFloatingButton moved to ConversationFilterSidebar 2026-06-01
// 2026-06-08: gỡ import api — banner "BỎ LỠ thông báo" đã tắt (checkInternalContactSetup no-op).
const theme = useTheme();
const route = useRoute();
const authStore = useAuthStore();
const router = useRouter();

// 2026-06-09 (anh báo menu bar kẹt, phải F5) — điều khiển dropdown nav bằng v-model
// + ép đóng HẾT sau mỗi điều hướng (kể cả khi điều hướng bị huỷ/chặn quyền). Dropdown
// Vuetify (z-index 2000) nếu kẹt mở sẽ phủ lên nav (z-index 100) nuốt click → đây là gốc lỗi.
const reportsMenu = ref(false);
const settingsMenu = ref(false);
const userMenu = ref(false);
function closeAllNavMenus() {
  reportsMenu.value = false;
  settingsMenu.value = false;
  userMenu.value = false;
}

// Trình chọn tài khoản Zalo đang làm việc (đa kênh)
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import { useWorkScope } from '@/composables/use-work-scope';
const { accounts: zaloAccounts, fetchAccounts: fetchZaloAccounts } = useZaloAccounts();
const workScope = useWorkScope();
const zaloMenu = ref(false);
const currentScopeId = computed(() => workScope.accountIds.value[0] ?? null);
const activeAccountName = computed(() => {
  if (!currentScopeId.value) return 'Tất cả tài khoản';
  const acc = (zaloAccounts.value || []).find(a => a.id === currentScopeId.value);
  return acc ? acc.displayName : 'Tất cả tài khoản';
});
const activeAccountAvatar = computed(() => {
  if (!currentScopeId.value) return null;
  const acc = (zaloAccounts.value || []).find(a => a.id === currentScopeId.value);
  return acc ? acc.avatarUrl : null;
});
function selectZaloAccount(id: string | null) {
  workScope.lockToNick(id);
}

// 2026-06-23 (anh báo: thao tác 1 lúc ở MỌI module rồi click nav không chuyển được, phải
// F5; hover vẫn hiện href ⇒ KHÔNG phải overlay phủ-hình). GỐC: overlay Vuetify (v-menu/
// v-dialog, z-index 2000) bị KẸT/ORPHAN — activator unmount giữa lúc mở (list re-render,
// đổi route…) để lại overlay + listener "click-outside" ở document → click nav bị nuốt
// (đóng overlay ma thay vì điều hướng). Fix cũ chỉ đóng 3 menu NAV, không dọn overlay từ
// module khác. Đây là DỌN TOÀN CỤC mọi overlay kẹt sau mỗi điều hướng:
//   1) Esc native → Vuetify tự đóng overlay còn mounted (sạch, không lỗi removeChild).
//   2) nextTick xong gỡ orphan DOM còn sót trong .v-overlay-container (component đã unmount
//      nên Vuetify không quản nữa → gỡ an toàn; bọc try/catch chống race).
function sweepStuckOverlays() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  } catch { /* no-op */ }
  void nextTick(() => {
    try {
      document
        .querySelectorAll('.v-overlay-container > .v-overlay.v-overlay--active')
        .forEach((el) => el.remove());
    } catch { /* race với Vuetify cleanup — bỏ qua */ }
  });
}

function cleanupAfterNav() {
  closeAllNavMenus();
  sweepStuckOverlays();
}
router.afterEach(() => cleanupAfterNav());
router.onError(() => cleanupAfterNav());

// Phase Internal Contact 2-method 2026-05-23 — banner cho sale chưa setup
// Phase Onboarding v1 redesign 2026-05-24: ẨN banner khi đang ở Dashboard route
// vì OnboardingChecklist đã cover. Banner chỉ nhắc ở các tab khác (Chat, Bạn bè,...).
const IC_BANNER_DISMISS_KEY = 'ic-banner-dismissed-until';
const _showICBannerRaw = ref(false);
const showInternalContactBanner = computed(() => {
  // Hide trên Dashboard — checklist đã hiện
  if (route.path === '/') return false;
  return _showICBannerRaw.value;
});
async function checkInternalContactSetup() {
  // 2026-06-08 (Anh chốt): TẮT banner "Bạn đang BỎ LỠ thông báo quan trọng từ CRM".
  // Lý do: giờ user được tạo bằng SĐT đã verify có Zalo 100% (wizard create-with-zalo),
  // recipient.threadIdInSenderView được điền sẵn lúc tạo → không cần nhắc sale tự vào
  // Cài đặt thiết lập nick liên lạc nội bộ nữa. Giữ lại logic bên dưới (comment) để dễ
  // bật lại nếu sau này cần.
  return;
  // if (!authStore.user) return;
  // const dismissedUntil = Number(localStorage.getItem(IC_BANNER_DISMISS_KEY) || '0');
  // if (dismissedUntil > Date.now()) return;
  // try {
  //   const { data } = await api.get('/me/internal-contact');
  //   if (!data.method || data.recipient?.status !== 'ready') {
  //     _showICBannerRaw.value = true;
  //   }
  // } catch { /* silent */ }
}
function goSetupInternalContact() {
  _showICBannerRaw.value = false;
  router.push('/settings/channels/zalo?tab=internal-contact');
}
function dismissInternalContactBanner() {
  _showICBannerRaw.value = false;
  localStorage.setItem(IC_BANNER_DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
}

onMounted(() => {
  theme.global.name.value = 'hsLight';
  localStorage.setItem('theme', 'hsLight');
  void checkInternalContactSetup();
  void fetchZaloAccounts();

});

interface SubItem {
  path: string;
  label: string;
  icon: string;
  resource?: string;
  action?: string;
}

interface NavTab {
  path: string;
  label: string;
  icon: string;
  matchPrefix?: string;
  resource?: string;
  subItems?: SubItem[];
}

const primaryTabs: NavTab[] = [
  { path: '/', label: 'Dashboard', icon: 'mdi-view-dashboard-outline', matchPrefix: '/$', resource: 'dashboard' },
  { path: '/chat', label: 'Tin nhắn', icon: 'mdi-message-text-outline', resource: 'conversation' },
  {
    path: '/pancake-orders',
    label: 'Giao vận',
    icon: 'mdi-truck-delivery-outline',
    resource: 'delivery',
    subItems: [
      { path: '/pancake-orders?tab=overview', label: 'Tổng quan', icon: 'mdi-view-dashboard-outline', resource: 'delivery', action: 'access' },
      { path: '/pancake-orders?tab=delivery', label: 'Giao vận', icon: 'mdi-clipboard-list-outline', resource: 'delivery', action: 'create' },
      { path: '/pancake-orders?tab=reports', label: 'Báo cáo', icon: 'mdi-chart-box-outline', resource: 'delivery', action: 'view_all' },
      { path: '/pancake-orders?tab=products', label: 'Áo + Ảnh', icon: 'mdi-tshirt-crew-outline', resource: 'delivery', action: 'edit' },
      { path: '/pancake-orders?tab=business', label: 'Doanh thu', icon: 'mdi-finance', resource: 'delivery_business', action: 'access' },
      { path: '/pancake-orders?tab=activity', label: 'Hoạt động gần đây', icon: 'mdi-history', resource: 'delivery', action: 'view_all' },
      { path: '/pancake-orders?tab=pancake', label: 'Đơn Pancake', icon: 'mdi-store-outline', resource: 'delivery', action: 'access' },
    ],
  },
  {
    path: '/orders',
    label: 'Đơn thiết kế',
    icon: 'mdi-palette-outline',
    resource: 'orders',
    subItems: [
      { path: '/orders?tab=overview', label: 'Tổng quan', icon: 'mdi-view-dashboard-outline', resource: 'orders', action: 'access' },
      { path: '/orders?tab=list', label: 'Đơn hàng', icon: 'mdi-format-list-bulleted', resource: 'orders', action: 'create' },
      { path: '/orders?tab=salary', label: 'Lương thiết kế', icon: 'mdi-cash-multiple', resource: 'orders_salary', action: 'access' },
      { path: '/orders?tab=report', label: 'Báo cáo', icon: 'mdi-chart-box-outline', resource: 'orders', action: 'view_all' },
    ],
  },
  {
    path: '/salary',
    label: 'Nhân sự',
    icon: 'mdi-calendar-account-outline',
    subItems: [
      { path: '/salary?tab=checkin', label: 'Chấm công', icon: 'mdi-clock-check-outline', resource: 'attendance', action: 'access' },
      { path: '/salary?tab=leaveAdmin', label: 'Duyệt nghỉ phép', icon: 'mdi-calendar-check-outline', resource: 'leave', action: 'edit' },
      { path: '/salary?tab=config', label: 'Cấu hình chấm công', icon: 'mdi-cog-outline', resource: 'attendance', action: 'view_all' },
      { path: '/salary?tab=table', label: 'Bảng lương', icon: 'mdi-table-account', resource: 'payroll', action: 'view_all' },
      { path: '/salary?tab=salaryMine', label: 'Phiếu lương của tôi', icon: 'mdi-file-document-outline', resource: 'payroll', action: 'access' },
    ],
  },
  {
    path: '/finance',
    label: 'Tài chính',
    icon: 'mdi-finance',
    resource: 'finance',
    subItems: [
      { path: '/finance?tab=overview', label: 'Tổng quan', icon: 'mdi-view-dashboard-outline', resource: 'finance', action: 'access' },
      { path: '/finance?tab=reserve', label: 'Quỹ dự phòng', icon: 'mdi-shield-check-outline', resource: 'finance', action: 'create' },
      { path: '/finance?tab=profit', label: 'Quỹ lợi nhuận', icon: 'mdi-trending-up', resource: 'finance', action: 'edit' },
      { path: '/finance?tab=debts', label: 'Công nợ', icon: 'mdi-account-cash-outline', resource: 'finance', action: 'delete' },
      { path: '/finance?tab=cashflow', label: 'Dòng tiền', icon: 'mdi-swap-horizontal', resource: 'finance', action: 'view_all' },
    ],
  },
  {
    path: '/marketing/friend-blast',
    label: 'Marketing',
    icon: 'mdi-bullhorn-outline',
    matchPrefix: '/marketing',
    subItems: [
      { path: '/marketing/friend-blast', label: 'Gửi tin nhắn bạn bè', icon: 'mdi-message-fast-outline', resource: 'friend_blast', action: 'access' },
      { path: '/marketing/group-blast', label: 'Gửi tin nhắn nhóm', icon: 'mdi-account-group-outline', resource: 'broadcast', action: 'access' },
      { path: '/marketing/unfriend-blast', label: 'Huỷ kết bạn hàng loạt', icon: 'mdi-account-minus-outline', resource: 'friend_blast', action: 'edit' },
      { path: '/marketing/group-leave-blast', label: 'Rời nhóm hàng loạt', icon: 'mdi-logout-variant', resource: 'broadcast', action: 'edit' },
    ],
  },
];

// RBAC 2026-06-08 — chỉ hiện tab user có quyền (Dashboard + Lịch hẹn luôn hiện).
const visiblePrimaryTabs = computed(() => {
  return primaryTabs.filter((t) => {
    if (t.path === '/salary') return authStore.canAccess('attendance') || authStore.canAccess('payroll');
    return !t.resource || authStore.canAccess(t.resource);
  });
});
// (2026-06-10) Bỏ showOrgGroup/showCrmGroup — dropdown redesign thành lối tắt phẳng,
// lọc per-item theo grants trực tiếp, không còn subheader nhóm cần gate.

function isActive(tab: NavTab): boolean {
  if (tab.matchPrefix === '/$') return route.path === '/';
  if (tab.matchPrefix) {
    return route.path === tab.matchPrefix || route.path.startsWith(tab.matchPrefix + '/');
  }
  return route.path === tab.path || route.path.startsWith(tab.path + '/');
}
const isSettingsActive = computed(() =>
  route.path === '/settings' || route.path.startsWith('/settings/'),
);
// Báo cáo dropdown active khi ở /analytics hoặc /reports
const isReportsActive = computed(
  () => route.path.startsWith('/analytics') || route.path.startsWith('/reports'),
);

// Workspace selector đã ẩn ở Variant A 2026-05-28 (single-tenant chưa cần switch).
// Sau này multi-tenant → revert back template + uncomment block dưới.

// Avatar top nav 2026-06-13 — dùng <Avatar/> (ảnh thật + fallback chữ cái), bỏ initials thủ công.
// 2026-06-13 (anh chốt): bỏ chọn theme tối — app luôn theme sáng 'hsLight' (mặc định ở vuetify.ts).

function logout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style scoped>
/* Phase Internal Contact 2-method 2026-05-23 — banner persistent */
.ic-banner {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 20px;
  background: linear-gradient(90deg, #FEF3C7 0%, #FDE68A 100%);
  border-bottom: 1px solid #FCD34D;
  color: #78350F;
  font-size: 13.5px;
}
.ic-banner-icon { font-size: 20px; flex-shrink: 0; }
.ic-banner-text { flex: 1; display: flex; flex-direction: column; gap: 2px; line-height: 1.3; }
.ic-banner-text strong { color: #92400E; font-weight: 700; }
.ic-banner-sub { font-size: 12px; color: #92400E; opacity: 0.85; }
.ic-banner-cta {
  background: #B45309; color: white; border: none;
  padding: 8px 16px; border-radius: 8px;
  font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit;
  white-space: nowrap;
}
.ic-banner-cta:hover { background: #92400E; }
.ic-banner-dismiss {
  background: transparent; color: #92400E; border: none;
  padding: 8px 10px; cursor: pointer; font-family: inherit;
  font-size: 14px; font-weight: 700;
}
.ic-banner-dismiss:hover { color: #78350F; }

/* Nhà Yến shell — teal-navy gradient nav (redesign 2026-06-05, đảo lock Variant A sáng) */
.header-wordmark {
  width: 220px;
  height: 34px;
  padding: 4px 0;
  margin-right: 0;
  flex: 0 0 220px;
  justify-content: center;
  display: flex;
  align-items: center;
  text-decoration: none;
}
.header-wordmark img {
  width: 132px;
  height: 100%;
  display: block;
  object-fit: contain;
}

.smax-topnav {
  background: #1A6FD4;
  color: #FFFFFF;
  height: 52px;
  display: flex; align-items: center;
  padding: 0 16px 0 0; gap: 4px;
  flex-shrink: 0;
  position: sticky; top: 0; z-index: 100;
  border-bottom: 0;
}

.chat-header-back-section {
  display: flex;
  align-items: center;
  margin-right: 14px;
  flex: none;
}
.back-to-select-btn {
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
  color: #FFFFFF;
}
.back-to-select-btn:hover {
  background-color: rgba(255, 255, 255, 0.14);
  color: #FFFFFF;
}
.back-account-name {
  font-size: 15px;
  font-weight: 700;
}

.nav-tabs {
  display: flex;
  align-items: center;
  background: transparent;
  padding: 3px;
  border-radius: 12px;
  gap: 2px;
  height: 42px;
  margin-left: 0;
}
.nav-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-radius: 10px;
  cursor: pointer;
  color: #FFFFFF;
  font-size: 16px;
  font-weight: 700;
  background: transparent;
  border: none;
  white-space: nowrap;
  text-decoration: none;
  height: 36px;
  line-height: 1.2;
  position: relative;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.nav-tab .ic-svg { color: #FFFFFF; transition: color 150ms; }
.nav-tab .caret { font-size: 9px; opacity: 0.55; margin-left: -2px; }
.nav-tab:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #FFFFFF;
}
.nav-tab:hover .ic-svg { color: #FFFFFF; }
.nav-tab.active {
  background: rgba(255, 255, 255, 0.22) !important;
  color: #FFFFFF !important;
  font-weight: 700;
  box-shadow: none;
}
.nav-tab.active .ic-svg { color: #FFFFFF; }

/* HD compact — chỉ kick in khi viewport < 1280 (rất hiếm với HD-first target) */
@media (max-width: 1500px) {
  .nav-tab { padding-inline: 9px; }
}
@media (max-width: 1280px) {
  .header-wordmark { display: none; }
  .nav-tab { padding: 7px 8px; font-size: 14px; gap: 5px; }
}
@media (max-width: 1100px) {
  .nav-tab { padding: 6px 7px; gap: 4px; }
}

.topnav-spacer { flex: 1; min-width: 0; }

.contact-marquee {
  flex: 0 0 320px;
  margin-right: 12px;
  height: 32px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: linear-gradient(90deg, rgba(0,242,255,0.12), rgba(0,119,182,0.12));
  border: 1px solid rgba(0,242,255,0.30);
  border-radius: 6px;
  text-decoration: none;
  color: #00F2FF;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
}
.contact-marquee:hover {
  background: linear-gradient(90deg, rgba(0,242,255,0.20), rgba(0,119,182,0.20));
  border-color: rgba(0,242,255,0.50);
}
.marquee-track {
  display: inline-block;
  white-space: nowrap;
  animation: marquee-scroll 32s linear infinite;
  will-change: transform;
}
.contact-marquee:hover .marquee-track {
  animation-play-state: paused;
}
@keyframes marquee-scroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@media (max-width: 1280px) {
  .contact-marquee { display: none; }
}

.topnav-search {
  max-width: 240px;
  flex-shrink: 1;
}
@media (max-width: 1500px) {
  .topnav-search { max-width: 200px; }
}
@media (max-width: 1280px) {
  .topnav-search { max-width: 160px; }
}
@media (max-width: 1100px) {
  .topnav-search { display: none; }
}
.topnav-search :deep(.v-field) {
  background: rgba(255, 255, 255, 0.08) !important;
  color: white;
  border-radius: 7px !important;
}
.topnav-search :deep(input) { color: white !important; }
.topnav-search :deep(input::placeholder) { color: rgba(255, 255, 255, 0.5) !important; }

.icon-btn,
:deep(.icon-btn-wrap) > * {
  width: 32px; height: 32px;
  border-radius: 7px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: rgba(255, 255, 255, 0.85);
  position: relative;
  font-size: 16px;
  text-decoration: none;
  background: transparent; border: none;
  margin-left: 2px;
}
.icon-btn:hover,
:deep(.icon-btn-wrap) > *:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.user-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  /* Module Cá nhân 2026-06-13 — bọc <Avatar/> (ảnh thật hoặc chữ cái gradient).
     Bỏ background vàng cũ, để Avatar tự render; button chỉ là khung bấm mở menu. */
  background: none; padding: 0;
  border: none; cursor: pointer;
  margin-left: 6px;
  display: flex; align-items: center; justify-content: center;
}
.user-avatar :deep(.smax-av) { box-shadow: 0 0 0 2px rgba(255,255,255,.25); }

.smax-main {
  background: var(--smax-grey-100);
}
.smax-main :deep(.v-main__wrap) { min-height: calc(100vh - var(--smax-topnav-h)); }

/* Vuetify menus rendered from v-menu inherit theme automatically.
   Force light surface in case parent has legacy-dark applied. */
:deep(.v-overlay__content > .v-list) {
  background: var(--smax-bg);
  color: var(--smax-text);
}
.zalo-scope-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 10px;
  cursor: pointer;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.24);
  height: 38px;
  line-height: 1.2;
  margin-left: 10px;
  transition: all 150ms ease;
}
.zalo-scope-picker:hover {
  background: #E5E7EB;
  border-color: #D1D5DB;
}
.zalo-scope-name {
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.zalo-scope-picker .caret {
  font-size: 9px;
  opacity: 0.55;
  margin-left: 2px;
}
:deep(.zalo-item-active) {
  background-color: #EBF3FF !important;
  color: #2F80ED !important;
  font-weight: 700;
}
</style>
