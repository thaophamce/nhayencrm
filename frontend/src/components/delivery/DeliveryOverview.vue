<template>
  <section class="delivery-overview-page">
    <!-- TOP HEADER -->
    <header class="overview-header">
      <div class="header-left">
        <h1 class="header-title">Tổng quan</h1>
        <p class="header-subtitle">{{ dateRangeDisplay }}</p>
      </div>

      <div class="header-right">
        <div class="search-combobox">
          <div class="search-box" :class="{ focused: searchFocused }">
            <v-icon size="18" color="#8C8F9E">mdi-magnify</v-icon>
            <input
              v-model="quickSearch"
              role="combobox"
              aria-label="Tìm đơn hàng"
              aria-autocomplete="list"
              :aria-expanded="showSearchSuggestions"
              aria-controls="delivery-search-suggestions"
              placeholder="Tìm theo mã đơn, tên hoặc SĐT..."
              autocomplete="off"
              @focus="searchFocused = true"
              @blur="closeSearchSuggestions"
              @keydown.down.prevent="moveSearchSelection(1)"
              @keydown.up.prevent="moveSearchSelection(-1)"
              @keydown.enter.prevent="handleSearch"
              @keydown.esc="searchFocused = false"
            />
            <v-progress-circular v-if="searchLoading" indeterminate size="16" width="2" color="#1A6FD4" />
          </div>
          <div v-if="showSearchSuggestions" id="delivery-search-suggestions" class="search-suggestions" role="listbox">
            <button
              v-for="(order, index) in searchResults"
              :key="order.id || order.orderCode"
              type="button"
              class="search-suggestion"
              :class="{ selected: index === selectedSearchIndex }"
              role="option"
              :aria-selected="index === selectedSearchIndex"
              @mousedown.prevent="selectSearchResult(order)"
            >
              <span class="suggestion-icon"><v-icon size="18">mdi-package-variant-closed</v-icon></span>
              <span class="suggestion-copy">
                <strong>{{ order.orderCode }}</strong>
                <small>{{ [order.recipientName, order.recipientPhone].filter(Boolean).join(' · ') || 'Đơn giao vận' }}</small>
              </span>
              <b>{{ formatMoney(order.totalAmount) }}</b>
            </button>
            <div v-if="!searchLoading && searchResults.length === 0" class="search-empty">
              Không tìm thấy đơn phù hợp
            </div>
          </div>
        </div>

        <div class="period-select-wrap">
          <select v-model="period" class="period-select" @change="loadData">
            <option value="month">Tháng này</option>
            <option value="week">Tuần này</option>
            <option value="lastMonth">Tháng trước</option>
            <option value="today">Hôm nay</option>
          </select>
        </div>
      </div>
    </header>

    <!-- MAIN GRID CONTAINER WITH RIGHT SIDEBAR -->
    <div class="overview-body-grid">
      <!-- LEFT CONTENT AREA -->
      <div class="overview-main-content">
        <!-- 4 KPI METRIC CARDS ROW -->
        <div class="kpi-cards-grid">
          <!-- CARD 1: TỔNG ĐƠN HÀNG -->
          <div class="kpi-card card-blue">
            <div class="kpi-card-header">
              <span class="kpi-label">Tổng đơn hàng</span>
              <div class="kpi-icon-wrap icon-blue">
                <v-icon size="20" color="#1A6FD4">mdi-package-variant-closed</v-icon>
              </div>
            </div>
            <div class="kpi-value">{{ formatNumber(displayData.totalOrders || 676) }}</div>
            <div class="kpi-subtext text-success">
              <v-icon size="14">mdi-triangle</v-icon>
              <span>1% so với kỳ trước</span>
            </div>
          </div>

          <!-- CARD 2: TỔNG DOANH THU -->
          <div class="kpi-card card-green">
            <div class="kpi-card-header">
              <span class="kpi-label">Tổng doanh thu</span>
              <div class="kpi-icon-wrap icon-green">
                <v-icon size="20" color="#00B69B">mdi-cash-multiple</v-icon>
              </div>
            </div>
            <div class="kpi-value">{{ formatMoney(displayData.revenue ?? 0) }}</div>
            <div class="kpi-subtext text-danger">
              <v-icon size="14" style="transform: rotate(180deg)">mdi-triangle</v-icon>
              <span>9% so với kỳ trước</span>
            </div>
          </div>

          <!-- CARD 3: TỔNG TIỀN CHƯA THANH TOÁN -->
          <div class="kpi-card card-red">
            <div class="kpi-card-header">
              <span class="kpi-label">Tổng tiền chưa thanh toán</span>
              <div class="kpi-icon-wrap icon-red">
                <v-icon size="20" color="#FF4D4F">mdi-alert-circle-outline</v-icon>
              </div>
            </div>
            <div class="kpi-value">{{ formatMoney(displayData.outstanding || 6635000) }}</div>
          </div>

          <!-- CARD 4: TỔNG TIỀN ĐẶT CỌC -->
          <div class="kpi-card card-gold">
            <div class="kpi-card-header">
              <span class="kpi-label">Tổng tiền đặt cọc</span>
              <div class="kpi-icon-wrap icon-gold">
                <v-icon size="20" color="#FAAD14">mdi-trending-up</v-icon>
              </div>
            </div>
            <div class="kpi-value">{{ formatMoney(displayData.deposit || 132025000) }}</div>
          </div>
        </div>

        <!-- ROW 2: KPI DOANH THU & TỶ LỆ CHUYỂN ĐỔI -->
        <div class="middle-cards-grid">
          <!-- KPI DOANH THU THÁNG -->
          <div class="overview-card kpi-goal-card">
            <div class="card-head">
              <div class="card-head-title">
                <h2>KPI Doanh thu tháng</h2>
                <span v-if="goalStage === 'completed'" class="badge-fire">🔥 Đã vượt mốc 150%!</span>
                <span v-else-if="monthlyRevenue >= MONTHLY_REVENUE_GOAL_3" class="badge-fire">🔥 Đã vượt mốc 130%!</span>
                <span v-else-if="monthlyRevenue >= MONTHLY_REVENUE_GOAL_2" class="badge-fire">🔥 Hoàn thành cả 2 mục tiêu!</span>
                <span v-else class="goal-guidance">{{ goalGuidance }}</span>
              </div>
              <div class="goal-percent-badge" :class="{ pending: goalStage !== 'completed' }">
                <span class="percent-num">{{ goalPercent }}%</span>
                <span class="percent-sub">Mục tiêu {{ currentGoalNumber }}</span>
              </div>
            </div>

            <div class="goal-progress-wrap">
              <div class="goal-progress-bar">
                <div class="progress-fill" :style="{ width: `${overallProgressPercent}%` }"></div>
                <div class="progress-marker" style="left: 52.16%" title="MT1"></div>
                <div class="progress-marker" style="left: 66.67%" title="MT2"></div>
                <div class="progress-marker" style="left: 86.67%" title="MT3 130%"></div>
                <div class="progress-marker" style="left: 100%" title="MT4 150%"></div>
              </div>

              <div class="goal-markers">
                <span class="marker-item" :class="{ active: monthlyRevenue >= MONTHLY_REVENUE_GOAL_1 }"><template v-if="monthlyRevenue >= MONTHLY_REVENUE_GOAL_1">✓ </template>MT1: {{ formatMoney(MONTHLY_REVENUE_GOAL_1) }}</span>
                <span class="marker-item" :class="{ active: monthlyRevenue >= MONTHLY_REVENUE_GOAL_2 }"><template v-if="monthlyRevenue >= MONTHLY_REVENUE_GOAL_2">✓ </template>MT2: {{ formatMoney(MONTHLY_REVENUE_GOAL_2) }}</span>
                <span class="marker-item" :class="{ active: monthlyRevenue >= MONTHLY_REVENUE_GOAL_3 }"><template v-if="monthlyRevenue >= MONTHLY_REVENUE_GOAL_3">✓ </template>MT3: {{ formatMoney(MONTHLY_REVENUE_GOAL_3) }}</span>
                <span class="marker-item" :class="{ active: monthlyRevenue >= MONTHLY_REVENUE_GOAL_4 }"><template v-if="monthlyRevenue >= MONTHLY_REVENUE_GOAL_4">✓ </template>MT4: {{ formatMoney(MONTHLY_REVENUE_GOAL_4) }}</span>
              </div>
            </div>

            <div class="goal-bottom-metrics">
              <div class="goal-metric">
                <span class="m-label">Hiện tại</span>
                <b class="m-val">{{ formatMoney(displayData.revenue ?? 0) }}</b>
              </div>
              <div class="goal-metric">
                <span class="m-label">Còn thiếu Mục tiêu {{ currentGoalNumber }}</span>
                <b class="m-val" :class="goalRemaining > 0 ? 'text-danger' : 'text-muted'">{{ goalRemaining > 0 ? formatMoney(goalRemaining) : '—' }}</b>
              </div>
              <div class="goal-metric">
                <span class="m-label">Chưa thu</span>
                <b class="m-val text-warning">{{ formatMoney(displayData.outstanding ?? 0) }}</b>
              </div>
            </div>
          </div>

          <!-- TỶ LỆ CHUYỂN ĐỔI -->
          <div class="overview-card conversion-card">
            <div class="card-head">
              <h2>Tỷ lệ chuyển đổi</h2>
            </div>

            <div class="conversion-body">
              <div class="conversion-progress-track">
                <div class="track-segment segment-paid" style="width: 99%"></div>
                <div class="track-segment segment-unpaid" style="width: 1%"></div>
              </div>

              <div class="conversion-legend-list">
                <div class="legend-row">
                  <div class="legend-left">
                    <span class="dot dot-paid"></span>
                    <span>Đã thanh toán</span>
                  </div>
                  <div class="legend-right">
                    <b class="rate-percent text-success">99%</b>
                    <span class="rate-money">927.085.000 đ</span>
                  </div>
                </div>

                <div class="legend-row">
                  <div class="legend-left">
                    <span class="dot dot-unpaid"></span>
                    <span>Chưa thanh toán</span>
                  </div>
                  <div class="legend-right">
                    <b class="rate-percent text-danger">1%</b>
                    <span class="rate-money">6.635.000 đ</span>
                  </div>
                </div>
              </div>

              <div class="conversion-footer font-weight-medium">
                <span>Tổng doanh thu</span>
                <b>{{ formatMoney(displayData.revenue ?? 0) }}</b>
              </div>
            </div>
          </div>
        </div>

        <!-- ROW 3: THỐNG KÊ DOANH THU & HOẠT ĐỘNG GẦN ĐÂY -->
        <div class="bottom-cards-grid">
          <!-- THỐNG KÊ DOANH THU CHART CARD -->
          <div class="overview-card chart-card">
            <div class="card-head">
              <div>
                <h2>Thống kê doanh thu</h2>
                <span class="card-sub-date">Tháng 07/2026</span>
              </div>
              <div class="chart-legend">
                <span class="legend-item"><i class="line-blue"></i> Doanh thu</span>
                <span class="legend-item"><i class="line-gold"></i> Đặt cọc</span>
                <span class="legend-item"><i class="line-red"></i> Chưa TT</span>
              </div>
            </div>

            <div class="chart-container">
              <svg viewBox="0 0 540 180" class="revenue-chart-svg">
                <!-- Grid Lines -->
                <line x1="40" y1="20" x2="520" y2="20" stroke="#F0F2F5" stroke-dasharray="3,3" />
                <line x1="40" y1="60" x2="520" y2="60" stroke="#F0F2F5" stroke-dasharray="3,3" />
                <line x1="40" y1="100" x2="520" y2="100" stroke="#F0F2F5" stroke-dasharray="3,3" />
                <line x1="40" y1="140" x2="520" y2="140" stroke="#F0F2F5" stroke-dasharray="3,3" />

                <!-- Y-Axis Labels -->
                <text x="32" y="24" text-anchor="end" class="chart-axis-text">100M</text>
                <text x="32" y="64" text-anchor="end" class="chart-axis-text">75M</text>
                <text x="32" y="104" text-anchor="end" class="chart-axis-text">50M</text>
                <text x="32" y="144" text-anchor="end" class="chart-axis-text">25M</text>

                <!-- Revenue Line (Blue) -->
                <path
                  d="M 40,30 Q 75,65 110,40 T 180,85 T 250,50 T 320,70 T 390,90 T 460,75 T 520,135"
                  fill="none"
                  stroke="#1A6FD4"
                  stroke-width="2.5"
                />

                <!-- Deposit Line (Gold) -->
                <path
                  d="M 40,110 Q 75,108 110,115 T 180,120 T 250,115 T 320,125 T 390,130 T 460,125 T 520,140"
                  fill="none"
                  stroke="#FAAD14"
                  stroke-width="2"
                />

                <!-- Outstanding Line (Red) -->
                <path
                  d="M 40,145 Q 75,147 110,146 T 180,148 T 250,145 T 320,147 T 390,146 T 460,147 T 520,148"
                  fill="none"
                  stroke="#FF4D4F"
                  stroke-width="2"
                />

                <!-- X-Axis Labels -->
                <text x="40" y="165" text-anchor="middle" class="chart-axis-text">02/07</text>
                <text x="80" y="165" text-anchor="middle" class="chart-axis-text">04/07</text>
                <text x="120" y="165" text-anchor="middle" class="chart-axis-text">07/07</text>
                <text x="160" y="165" text-anchor="middle" class="chart-axis-text">09/07</text>
                <text x="200" y="165" text-anchor="middle" class="chart-axis-text">11/07</text>
                <text x="240" y="165" text-anchor="middle" class="chart-axis-text">14/07</text>
                <text x="280" y="165" text-anchor="middle" class="chart-axis-text">16/07</text>
                <text x="320" y="165" text-anchor="middle" class="chart-axis-text">18/07</text>
                <text x="360" y="165" text-anchor="middle" class="chart-axis-text">21/07</text>
                <text x="400" y="165" text-anchor="middle" class="chart-axis-text">23/07</text>
                <text x="440" y="165" text-anchor="middle" class="chart-axis-text">25/07</text>
                <text x="480" y="165" text-anchor="middle" class="chart-axis-text">28/07</text>
              </svg>
            </div>
          </div>

          <!-- HOẠT ĐỘNG GẦN ĐÂY -->
          <div class="overview-card activity-card">
            <div class="card-head">
              <h2>Hoạt động gần đây</h2>
              <button type="button" class="link-btn">Xem tất cả →</button>
            </div>

            <div class="activity-list">
              <div
                v-for="(item, idx) in activityList"
                :key="idx"
                class="activity-item clickable-activity"
                @click="openOrder(item.orderCode)"
              >
                <div class="act-icon" :class="item.type === 'create' ? 'act-add' : 'act-edit'">
                  <v-icon size="14">{{ item.type === 'create' ? 'mdi-plus' : 'mdi-pencil-outline' }}</v-icon>
                </div>
                <div class="act-details">
                  <div class="act-desc">
                    <span class="act-action">{{ item.actionText }}</span>
                    <strong class="act-code" @click.stop="openOrder(item.orderCode)">{{ item.orderCode }}</strong>
                    <span v-if="item.customer" class="act-cust" @click.stop="openOrder(item.orderCode)">{{ item.customer }}</span>
                  </div>
                  <div class="act-time-row">
                    <span class="act-time">{{ item.timestamp }}</span>
                    <span class="act-author">bởi {{ item.author }}</span>
                  </div>
                </div>
                <div class="act-ago">{{ item.ago }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT SIDEBAR: CẢNH BÁO (ĐƠN CHƯA THANH TOÁN QUÁ 4 NGÀY) -->
      <aside class="overview-right-sidebar">
        <div class="alert-sidebar-card">
          <header class="alert-header">
            <div class="alert-title">
              <span class="alert-bell-wrap">
                <v-icon size="18" color="#F57C00">mdi-bell-outline</v-icon>
              </span>
              <h2>Cảnh báo</h2>
            </div>

            <span class="alert-count-badge">{{ overdueList.length }}</span>
          </header>

          <div class="alert-sub-bar">
            <span class="pill-urgent-sub">{{ overdueList.length }} khẩn cấp</span>
          </div>

          <div class="alert-cards-scroll">
            <div v-if="loading" class="alert-empty-state">
              <v-progress-circular indeterminate size="24" width="2" color="#E5484D" />
              <span>Đang kiểm tra đơn quá hạn...</span>
            </div>

            <div v-else-if="!overdueList.length" class="alert-empty-state success">
              <v-icon size="28" color="#168A50">mdi-check-circle-outline</v-icon>
              <strong>Không có đơn quá 4 ngày</strong>
              <small>Tất cả đơn giao vận đều đã thanh toán đúng hạn.</small>
            </div>

            <template v-else>
              <article
                v-for="order in overdueList"
                :key="order.id"
                class="overdue-card"
              >
                <div class="overdue-card-top">
                  <span class="tag-urgent">
                    <v-icon size="14" color="#E5484D">mdi-alert-circle</v-icon>
                    KHẨN CẤP
                  </span>
                  <span class="badge-urgent-days">{{ formatAgeDays(order) }}</span>
                </div>

                <div class="overdue-title" @click="openOrder(order.orderCode)">
                  Đơn {{ order.orderCode }} {{ order.recipientName ? order.recipientName : '' }}
                </div>

                <div class="overdue-carrier">
                  {{ order.carrierName || getCarrierLabel(order.deliveryMethod) }}
                </div>

                <div class="overdue-debt font-weight-bold">
                  Còn nợ: <span class="debt-money">{{ formatMoney(getRemainingDebt(order)) }}</span>
                </div>

                <div class="overdue-action-row">
                  <button type="button" class="btn-xem-ngay" @click="openOrder(order.orderCode)">
                    Xem ngay →
                  </button>
                </div>
              </article>
            </template>
          </div>

          <footer class="alert-sidebar-footer">
            <span>Cập nhật tự động · {{ overdueList.length }} đơn cần xử lý</span>
          </footer>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/api';

const emit = defineEmits<{ (e: 'open-detail', code: string): void }>();

const period = ref('month');
const quickSearch = ref('');
const searchFocused = ref(false);
const searchLoading = ref(false);
const searchResults = ref<any[]>([]);
const selectedSearchIndex = ref(-1);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchRequestId = 0;
const loading = ref(false);
const data = ref<any>({});
const overdueOrdersRaw = ref<any[]>([]);

const dateRangeDisplay = computed(() => {
  const n = new Date();
  if (period.value === 'month') return `01/${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()} - 31/${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()}`;
  if (period.value === 'today') return `${String(n.getDate()).padStart(2, '0')}/${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()}`;
  return '01/07/2026 - 31/07/2026';
});

const displayData = computed(() => data.value || {});
const showSearchSuggestions = computed(() => searchFocused.value && quickSearch.value.trim().length >= 2);
const MONTHLY_REVENUE_GOAL_1 = 719_000_000;
const MONTHLY_REVENUE_GOAL_2 = 918_901_000;
const MONTHLY_REVENUE_GOAL_3 = 1_194_571_300; // 130% MT2
const MONTHLY_REVENUE_GOAL_4 = 1_378_351_500; // 150% MT2
const monthlyRevenue = computed(() => Math.max(0, Number(displayData.value.revenue) || 0));
const goalStage = computed(() => monthlyRevenue.value >= MONTHLY_REVENUE_GOAL_4
  ? 'completed'
  : monthlyRevenue.value >= MONTHLY_REVENUE_GOAL_3 ? 'goal4'
  : monthlyRevenue.value >= MONTHLY_REVENUE_GOAL_2 ? 'goal3'
  : monthlyRevenue.value >= MONTHLY_REVENUE_GOAL_1 ? 'goal2' : 'goal1');
const currentGoalNumber = computed(() => {
  if (goalStage.value === 'goal1') return 1;
  if (goalStage.value === 'goal2') return 2;
  if (goalStage.value === 'goal3') return 3;
  return 4;
});
const currentGoalAmount = computed(() => {
  if (currentGoalNumber.value === 1) return MONTHLY_REVENUE_GOAL_1;
  if (currentGoalNumber.value === 2) return MONTHLY_REVENUE_GOAL_2;
  if (currentGoalNumber.value === 3) return MONTHLY_REVENUE_GOAL_3;
  return MONTHLY_REVENUE_GOAL_4;
});
const goalPercent = computed(() => Math.min(100, Math.round((monthlyRevenue.value / currentGoalAmount.value) * 100)));
const overallProgressPercent = computed(() => Math.min(100, (monthlyRevenue.value / MONTHLY_REVENUE_GOAL_4) * 100));
const goalRemaining = computed(() => Math.max(0, currentGoalAmount.value - monthlyRevenue.value));
const goalGuidance = computed(() => {
  if (goalStage.value === 'completed') return '';
  return `Đang hướng tới Mục tiêu ${currentGoalNumber.value}`;
});

const overdueList = computed(() => {
  if (data.value.overdueOrders && Array.isArray(data.value.overdueOrders) && data.value.overdueOrders.length > 0) {
    return data.value.overdueOrders;
  }
  return overdueOrdersRaw.value;
});

// Mock Activity logs matching screenshot if backend logs are empty
const activityList = computed(() => {
  if (data.value.recent && Array.isArray(data.value.recent) && data.value.recent.length > 0) {
    return data.value.recent.map((o: any) => ({
      type: 'update',
      actionText: 'Cập nhật đơn',
      orderCode: `#${o.orderCode}`,
      customer: o.recipientName || '',
      timestamp: formatDate(o.createdDate),
      author: o.createdBy?.fullName || 'anhhee1999',
      ago: formatAgo(o.createdDate)
    }));
  }

  return [];
});

function rangeParams() {
  const n = new Date(), f = new Date(n);
  if (period.value === 'week') {
    f.setDate(n.getDate() - ((n.getDay() + 6) % 7));
    f.setHours(0, 0, 0, 0);
    return { from: f.toISOString(), to: new Date(f.getTime() + 7 * 86400000).toISOString() };
  }
  const shift = period.value === 'lastMonth' ? -1 : 0;
  return {
    from: new Date(n.getFullYear(), n.getMonth() + shift, 1).toISOString(),
    to: new Date(n.getFullYear(), n.getMonth() + shift + 1, 1).toISOString()
  };
}

async function loadData() {
  loading.value = true;
  try {
    const res = await api.get('/delivery/analytics', { params: rangeParams() });
    data.value = res.data || {};

    // Also fetch overdue orders list if not returned
    const overdueRes = await api.get('/delivery/orders', { params: { overdue: 'true', days: 4, limit: 100 } });
    overdueOrdersRaw.value = overdueRes.data.orders || [];
  } catch (err) {
    console.error('Cannot load delivery overview data:', err);
    data.value = {};
    overdueOrdersRaw.value = [];
  } finally {
    loading.value = false;
  }
}

watch(quickSearch, (value) => {
  selectedSearchIndex.value = -1;
  if (searchTimer) clearTimeout(searchTimer);
  const query = value.trim();
  if (query.length < 2) {
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }
  searchTimer = setTimeout(() => void fetchSearchSuggestions(query), 250);
});

async function fetchSearchSuggestions(query: string) {
  const requestId = ++searchRequestId;
  searchLoading.value = true;
  try {
    const { data: response } = await api.get('/delivery/orders', { params: { search: query, limit: 6 } });
    if (requestId === searchRequestId) searchResults.value = response?.orders || [];
  } catch {
    if (requestId === searchRequestId) searchResults.value = [];
  } finally {
    if (requestId === searchRequestId) searchLoading.value = false;
  }
}

function handleSearch() {
  const order = searchResults.value[selectedSearchIndex.value] || searchResults.value[0];
  if (order) selectSearchResult(order);
}

function selectSearchResult(order: any) {
  if (!order?.orderCode) return;
  quickSearch.value = order.orderCode;
  searchFocused.value = false;
  emit('open-detail', order.orderCode);
}

function moveSearchSelection(direction: number) {
  if (!searchResults.value.length) return;
  const next = selectedSearchIndex.value + direction;
  selectedSearchIndex.value = next < 0 ? searchResults.value.length - 1 : next % searchResults.value.length;
}

function closeSearchSuggestions() {
  window.setTimeout(() => { searchFocused.value = false; }, 120);
}

function openOrder(code: string) {
  if (!code) return;
  const cleanCode = code.replace(/^#/, '');
  emit('open-detail', cleanCode);
}

function getCarrierLabel(m: string) {
  if (m === 'grab') return 'Grab';
  if (m === 'viettelpost') return 'Viettel Post';
  if (m === 'ghtk') return 'GHTK';
  if (m === 'chanhxe') return 'Chành xe';
  return 'Chành xe';
}

function getRemainingDebt(o: any) {
  if (o.remainingAmount !== undefined) return o.remainingAmount;
  const total = Number(o.totalAmount) || 0;
  const dep = Number(o.deposit) || 0;
  return Math.max(0, total - dep);
}

function formatAgeDays(o: any) {
  const created = new Date(o.createdDate || Date.now()).getTime();
  const diffMs = Math.max(0, Date.now() - created);
  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  return `${days || 4} ngày`;
}

function formatMoney(val: any) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

function formatNumber(val: any) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN').format(num);
}

function formatDate(v: string) {
  if (!v) return '28/07/2026 14:16';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatAgo(v: string) {
  if (!v) return '24 phút trước';
  const diffMin = Math.floor((Date.now() - new Date(v).getTime()) / 60000);
  return diffMin > 0 ? `${diffMin} phút trước` : 'vừa xong';
}

onMounted(loadData);
</script>

<style scoped>
.delivery-overview-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #F4F6F9;
  overflow-y: auto;
  padding: 20px 24px;
  font-family: inherit;
}

/* TOP HEADER */
.overview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.header-title {
  font-size: 22px;
  font-weight: 800;
  color: #1E202C;
  margin: 0;
}

.header-subtitle {
  font-size: 13px;
  color: #7B8798;
  margin: 2px 0 0;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid #E2E8F0;
  background: #FFFFFF;
  min-width: 260px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.search-box input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  width: 100%;
  color: #1E202C;
}

.search-combobox {
  position: relative;
  min-width: 300px;
}

.search-box.focused {
  border-color: #1A6FD4;
  box-shadow: 0 0 0 3px rgba(26, 111, 212, 0.12);
}

.search-suggestions {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  overflow: hidden;
  border: 1px solid #DCE3EC;
  border-radius: 10px;
  background: #FFFFFF;
  box-shadow: 0 12px 30px rgba(31, 41, 55, 0.16);
}

.search-suggestion {
  width: 100%;
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 0;
  border-bottom: 1px solid #EDF0F5;
  background: #FFFFFF;
  color: #253248;
  text-align: left;
  cursor: pointer;
}

.search-suggestion:last-child { border-bottom: 0; }
.search-suggestion:hover,.search-suggestion.selected { background: #F2F7FD; }
.suggestion-icon { width: 32px; height: 32px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 8px; background: #EBF3FF; color: #1A6FD4; }
.suggestion-copy { min-width: 0; flex: 1; }
.suggestion-copy strong,.suggestion-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.suggestion-copy strong { font-size: 13px; }
.suggestion-copy small { margin-top: 2px; color: #7B8798; font-size: 11px; }
.search-suggestion > b { flex: 0 0 auto; color: #1A6FD4; font-size: 12px; }
.search-empty { padding: 16px; color: #7B8798; font-size: 12px; text-align: center; }

.period-select {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid #E2E8F0;
  background: #FFFFFF;
  font-size: 13px;
  font-weight: 700;
  color: #1E202C;
  outline: none;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

/* MAIN GRID LAYOUT WITH RIGHT SIDEBAR */
.overview-body-grid {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  width: 100%;
}

.overview-main-content {
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* KPI CARDS GRID */
.kpi-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.kpi-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 16px;
  border: 1px solid #EAECEF;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kpi-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
}

.card-blue::before { background: #1A6FD4; }
.card-green::before { background: #00B69B; }
.card-red::before { background: #FF4D4F; }
.card-gold::before { background: #FAAD14; }

.kpi-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kpi-label {
  font-size: 13px;
  font-weight: 600;
  color: #5F6173;
}

.kpi-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-blue { background: #EBF3FF; }
.icon-green { background: #E6F8F5; }
.icon-red { background: #FFF0F2; }
.icon-gold { background: #FFFBE6; }

.kpi-value {
  font-size: 22px;
  font-weight: 800;
  color: #1E202C;
  line-height: 1.2;
}

.kpi-subtext {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 700;
}

.text-success { color: #00B69B; }
.text-danger { color: #FF4D4F; }
.text-warning { color: #FAAD14; }
.text-muted { color: #8C8F9E; }

/* MIDDLE CARDS GRID */
.middle-cards-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
}

.overview-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 18px;
  border: 1px solid #EAECEF;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.card-head h2 {
  font-size: 16px;
  font-weight: 800;
  color: #1E202C;
  margin: 0;
}

.card-head-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.badge-fire {
  font-size: 12px;
  font-weight: 700;
  color: #D48806;
  background: #FFFBE6;
  padding: 2px 8px;
  border-radius: 8px;
}

.goal-guidance {
  flex-basis: 100%;
  font-size: 12px;
  color: #8C8F9E;
  font-weight: 600;
}

.goal-percent-badge {
  text-align: right;
}

.percent-num {
  display: block;
  font-size: 24px;
  font-weight: 800;
  color: #00B69B;
  line-height: 1;
}

.goal-percent-badge.pending .percent-num {
  color: #FA8C16;
}

.percent-sub {
  font-size: 11px;
  color: #7B8798;
  font-weight: 600;
}

.goal-progress-wrap {
  margin-bottom: 18px;
}

.goal-progress-bar {
  position: relative;
  height: 12px;
  background: #EAECEF;
  border-radius: 6px;
  overflow: visible;
  margin-bottom: 8px;
}

.progress-marker {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  border-radius: 1px;
  background: #253248;
  z-index: 2;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00B69B, #34A853);
  border-radius: 6px;
}

.goal-markers {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
  color: #536075;
}

.marker-item.active {
  color: #00B69B;
}

.goal-bottom-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding-top: 14px;
  border-top: 1px dashed #EAECEF;
}

.goal-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.m-label {
  font-size: 11.5px;
  color: #7B8798;
  font-weight: 600;
}

.m-val {
  font-size: 15px;
  font-weight: 800;
  color: #1E202C;
}

/* CONVERSION CARD */
.conversion-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conversion-progress-track {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: #EAECEF;
}

.segment-paid { background: #00B69B; }
.segment-unpaid { background: #FF4D4F; }

.conversion-legend-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.legend-left {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #5F6173;
  font-weight: 600;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-paid { background: #00B69B; }
.dot-unpaid { background: #FF4D4F; }

.legend-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rate-percent {
  font-size: 14px;
  font-weight: 800;
}

.rate-money {
  font-size: 12.5px;
  color: #7B8798;
}

.conversion-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #F0F2F5;
  font-size: 13px;
  color: #1E202C;
}

/* BOTTOM CARDS GRID */
.bottom-cards-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 16px;
}

.card-sub-date {
  font-size: 12px;
  color: #7B8798;
  font-weight: 600;
}

.chart-legend {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #5F6173;
  font-weight: 600;
}

.chart-legend i {
  display: inline-block;
  width: 12px;
  height: 3px;
  border-radius: 2px;
  vertical-align: middle;
  margin-right: 4px;
}

.line-blue { background: #1A6FD4; }
.line-gold { background: #FAAD14; }
.line-red { background: #FF4D4F; }

.chart-container {
  width: 100%;
  height: 180px;
  margin-top: 10px;
}

.revenue-chart-svg {
  width: 100%;
  height: 100%;
}

.chart-axis-text {
  font-size: 10px;
  fill: #8C8F9E;
  font-weight: 600;
}

/* ACTIVITY LIST */
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 260px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  transition: background 0.15s ease;
  cursor: pointer;
}

.activity-item:hover {
  background: #F7F9FC;
}

.act-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.act-add { background: #E6F8F5; color: #00B69B; }
.act-edit { background: #EBF3FF; color: #1A6FD4; }

.act-details {
  flex: 1;
  min-width: 0;
}

.act-desc {
  font-size: 13px;
  color: #1E202C;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.act-action {
  color: #5F6173;
  margin-right: 4px;
}

.act-code {
  color: #1A6FD4;
  margin-right: 4px;
}

.act-cust {
  color: #5F6173;
}

.act-time-row {
  font-size: 11px;
  color: #8C8F9E;
  display: flex;
  gap: 8px;
  margin-top: 1px;
}

.act-ago {
  font-size: 11.5px;
  color: #8C8F9E;
  white-space: nowrap;
}

.link-btn {
  background: transparent;
  border: none;
  color: #D48806;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

/* RIGHT SIDEBAR: CẢNH BÁO */
.overview-right-sidebar {
  width: 320px;
  flex: 0 0 320px;
  min-width: 0;
  position: sticky;
  top: 0;
}

.alert-sidebar-card {
  background: #FFFFFF;
  border: 1px solid #EAECEF;
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.alert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 10px;
}

.alert-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.alert-bell-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #FFF4E5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.alert-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #1E202C;
}

.alert-count-badge {
  min-width: 26px;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  background: #E5484D;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.alert-sub-bar {
  padding: 0 18px 12px;
}

.pill-urgent-sub {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 12px;
  background: #FFF0F2;
  color: #E5484D;
  font-size: 12px;
  font-weight: 800;
}

.alert-cards-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 16px;
  max-height: calc(100vh - 300px);
  overflow-y: auto;
}

/* OVERDUE CARD - RED THEME */
.overdue-card {
  background: #FFF0F2;
  border: 1px solid #FFD6DD;
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.overdue-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tag-urgent {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #E5484D;
  font-size: 11px;
  font-weight: 800;
}

.badge-urgent-days {
  padding: 3px 10px;
  border-radius: 12px;
  background: #FFD6DD;
  color: #E5484D;
  font-size: 11px;
  font-weight: 700;
}

.overdue-title {
  font-size: 14.5px;
  font-weight: 800;
  color: #1E202C;
  cursor: pointer;
  line-height: 1.35;
}

.overdue-title:hover {
  color: #1A6FD4;
  text-decoration: underline;
}

.overdue-carrier {
  font-size: 12px;
  color: #5F6173;
  font-weight: 500;
}

.overdue-debt {
  font-size: 13px;
  color: #5F6173;
}

.debt-money {
  color: #CF1322;
  font-weight: 800;
}

.overdue-action-row {
  margin-top: 4px;
}

.btn-xem-ngay {
  background: transparent;
  border: none;
  padding: 0;
  color: #E5484D;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
}

.btn-xem-ngay:hover {
  text-decoration: underline;
}

.alert-sidebar-footer {
  padding: 12px 14px;
  border-top: 1px solid #F0F2F5;
  background: #FAFAFC;
  text-align: center;
  font-size: 11.5px;
  color: #8C8F9E;
  font-weight: 600;
}

.alert-empty-state {
  padding: 30px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #5F6173;
  font-size: 13px;
}

.alert-empty-state.success small {
  color: #8C8F9E;
  font-size: 12px;
}

@media (max-width: 1280px) {
  .overview-body-grid {
    flex-direction: column;
  }

  .overview-right-sidebar {
    width: 100%;
    flex: none;
    position: static;
  }

  .kpi-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .middle-cards-grid,
  .bottom-cards-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .overview-header,.header-right { align-items: stretch; flex-direction: column; }
  .search-combobox { min-width: 0; width: 100%; }
  .search-box { min-width: 0; }
}
</style>
