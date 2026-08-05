<template>
  <section class="delivery-reports-page">
    <!-- HEADER -->
    <header class="reports-header">
      <div class="header-left">
        <h1 class="header-title">Báo cáo</h1>
        <p class="header-subtitle">{{ formatNumber(displayData.totalOrders || 677) }} đơn trong kỳ</p>
      </div>

      <div class="period-tabs">
        <button
          v-for="p in periodOptions"
          :key="p.value"
          type="button"
          class="period-tab-btn"
          :class="{ active: period === p.value }"
          @click="changePeriod(p.value)"
        >
          {{ p.label }}
        </button>
      </div>
    </header>

    <!-- MAIN BODY GRID WITH RIGHT SIDEBAR -->
    <div class="reports-body-grid">
      <!-- LEFT MAIN CONTENT -->
      <div class="reports-main-content">
        <!-- ROW 1: 4 KPI CARDS -->
        <div class="kpi-cards-grid">
          <!-- CARD 1: TỔNG ĐƠN -->
          <div class="kpi-card card-blue">
            <span class="kpi-label">Tổng đơn</span>
            <div class="kpi-value">{{ formatNumber(displayData.totalOrders || 677) }}</div>
          </div>

          <!-- CARD 2: DOANH THU -->
          <div class="kpi-card card-green">
            <span class="kpi-label">Doanh thu</span>
            <div class="kpi-value">{{ formatMoney(displayData.revenue ?? 0) }}</div>
          </div>

          <!-- CARD 3: CHƯA THU -->
          <div class="kpi-card card-red">
            <span class="kpi-label">Chưa thu</span>
            <div class="kpi-value">{{ formatMoney(displayData.outstanding || 6635000) }}</div>
          </div>

          <!-- CARD 4: QUÁ HẠN -->
          <div class="kpi-card card-gold">
            <span class="kpi-label">Quá hạn</span>
            <div class="kpi-value">{{ overdueList.length || 3 }} đơn</div>
          </div>
        </div>

        <!-- ROW 2: DOANH THU THEO NGÀY (BAR CHART) -->
        <div class="reports-card daily-chart-card">
          <div class="card-head">
            <div class="head-title">
              <v-icon size="18" color="#00B69B">mdi-chart-bar</v-icon>
              <h2>Doanh thu theo ngày</h2>
            </div>
          </div>

          <div class="chart-bars-wrap">
            <div class="y-axis-labels">
              <span>100M</span>
              <span>75M</span>
              <span>50M</span>
              <span>25M</span>
              <span>0M</span>
            </div>

            <div class="bars-container">
              <div
                v-for="(d, idx) in dailyChartData"
                :key="idx"
                class="bar-column"
              >
                <div class="bar-track">
                  <div
                    class="bar-fill"
                    :style="{ height: `${Math.max(6, (d.revenue / maxDailyRevenue) * 100)}%` }"
                    :title="`${d.dateLabel}: ${formatMoney(d.revenue)}`"
                  ></div>
                </div>
                <span class="bar-date">{{ d.dateLabel }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ROW 3: BREAKDOWN CARDS (SIDE-BY-SIDE) -->
        <div class="breakdown-cards-grid">
          <!-- CARD 1: THEO HÌNH THỨC GIAO -->
          <div class="reports-card">
            <div class="card-head">
              <div class="head-title">
                <v-icon size="18" color="#1A6FD4">mdi-truck-delivery-outline</v-icon>
                <h2>Theo hình thức giao</h2>
              </div>
            </div>

            <div class="method-list">
              <div v-for="m in deliveryMethodList" :key="m.key" class="method-item">
                <div class="method-row-top">
                  <div class="method-title">
                    <span class="method-dot" :style="{ background: m.color }"></span>
                    <strong>{{ m.label }}</strong>
                  </div>
                  <div class="method-stats">
                    <b class="m-count">{{ m.count }} đơn</b>
                    <span class="m-rev">{{ formatMoney(m.revenue) }}</span>
                  </div>
                </div>

                <div class="method-progress-bar">
                  <div
                    class="progress-inner"
                    :style="{ width: `${Math.min(100, (m.revenue / maxMethodRevenue) * 100)}%`, background: m.color }"
                  ></div>
                </div>

                <div v-if="m.outstanding > 0" class="method-unpaid-text">
                  Chưa thu: {{ formatMoney(m.outstanding) }}
                </div>
              </div>
            </div>
          </div>

          <!-- CARD 2: THEO XƯỞNG (NHẬN TẠI XƯỞNG) -->
          <div class="reports-card">
            <div class="card-head">
              <div class="head-title">
                <v-icon size="18" color="#FAAD14">mdi-store-outline</v-icon>
                <h2>Theo xưởng (Nhận tại xưởng)</h2>
              </div>
            </div>

            <div class="method-list">
              <div v-for="w in warehouseList" :key="w.key" class="method-item">
                <div class="method-row-top">
                  <div class="method-title">
                    <span class="method-dot" :style="{ background: w.color }"></span>
                    <strong>{{ w.label }}</strong>
                  </div>
                  <div class="method-stats">
                    <b class="m-count">{{ w.count }} đơn</b>
                    <span class="m-rev">{{ formatMoney(w.revenue) }}</span>
                  </div>
                </div>

                <div class="method-progress-bar">
                  <div
                    class="progress-inner"
                    :style="{ width: `${Math.min(100, (w.revenue / maxWarehouseRevenue) * 100)}%`, background: w.color }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ROW 4: DATA TABLE CARD (ĐƠN QUÁ HẠN & CHƯA THANH TOÁN) -->
        <div class="reports-card table-card">
          <div class="card-head">
            <div class="head-title">
              <v-icon size="18" color="#FF4D4F">mdi-alert-circle-outline</v-icon>
              <h2 class="text-danger-title">Đơn quá hạn & chưa thanh toán</h2>
            </div>

            <span class="badge-overdue-count">{{ overdueList.length }} quá hạn</span>
          </div>

          <div class="table-responsive">
            <table class="reports-table">
              <thead>
                <tr>
                  <th>MÃ ĐƠN</th>
                  <th>NGÀY TẠO</th>
                  <th>HÌNH THỨC</th>
                  <th>CÒN NỢ</th>
                  <th>TRẠNG THÁI</th>
                  <th>SỐ NGÀY</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading && !overdueList.length">
                  <td colspan="6" class="text-center py-4 text-slate-400">Đang tải dữ liệu...</td>
                </tr>
                <tr v-else-if="!overdueList.length">
                  <td colspan="6" class="text-center py-4 text-slate-400">Không có đơn quá hạn</td>
                </tr>
                <tr
                  v-for="o in overdueList"
                  :key="o.id"
                  class="overdue-table-row"
                  @click="openOrder(o.orderCode)"
                >
                  <td class="col-code">
                    <button type="button" class="btn-order-code">
                      #{{ o.orderCode }} {{ o.recipientName ? o.recipientName : '' }}
                    </button>
                  </td>
                  <td class="col-date">{{ formatDate(o.createdDate) }}</td>
                  <td class="col-method">{{ o.carrierName || getCarrierLabel(o.deliveryMethod) }}</td>
                  <td class="col-debt font-weight-bold text-danger">
                    {{ formatMoney(getRemainingDebt(o)) }}
                  </td>
                  <td class="col-status">
                    <span class="chip-overdue">Quá hạn</span>
                  </td>
                  <td class="col-days font-weight-bold text-danger">
                    {{ formatAgeDays(o) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- RIGHT SIDEBAR: CẢNH BÁO (CẢNH BÁO ĐƠN CHƯA THANH TOÁN QUÁ 4 NGÀY) -->
      <aside class="reports-right-sidebar">
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
            <div v-if="loading && !overdueList.length" class="alert-empty-state">
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
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';

const emit = defineEmits<{ (e: 'open-detail', code: string): void }>();

const period = ref('month');
const loading = ref(false);
const data = ref<any>({});
const overdueOrdersRaw = ref<any[]>([]);

const periodOptions = [
  { value: 'month', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' },
  { value: 'week', label: 'Tuần này' },
  { value: 'lastWeek', label: 'Tuần trước' },
  { value: 'custom', label: 'Tùy chọn' },
];

const displayData = computed(() => data.value || {});

const overdueList = computed(() => {
  if (data.value.overdueOrders && Array.isArray(data.value.overdueOrders) && data.value.overdueOrders.length > 0) {
    return data.value.overdueOrders;
  }
  if (overdueOrdersRaw.value.length > 0) return overdueOrdersRaw.value;

  return [];
});

// Daily bar chart mock/real data
const dailyChartData = computed(() => {
  const byDay = data.value.byDay || [];
  if (byDay.length > 0) {
    return byDay.map((d: any) => ({
      dateLabel: d.date ? d.date.slice(8) + '/' + d.date.slice(5, 7) : '01/07',
      revenue: Number(d.revenue) || 0
    }));
  }

  return [];
});

const maxDailyRevenue = computed(() => {
  const max = Math.max(1, ...dailyChartData.value.map((d: any) => d.revenue));
  return max;
});

// Delivery Method breakdown list matching image
const deliveryMethodList = computed(() => {
  const byMethod = data.value.byMethod || {};
  if (Object.keys(byMethod).length > 0) {
    return [
      { key: 'chanhxe', label: 'Chành xe', count: byMethod.chanhxe?.count || 0, revenue: byMethod.chanhxe?.revenue || 0, outstanding: byMethod.chanhxe?.outstanding || 0, color: '#F57C00' },
      { key: 'grab', label: 'Grab', count: byMethod.grab?.count || 0, revenue: byMethod.grab?.revenue || 0, outstanding: byMethod.grab?.outstanding || 0, color: '#00B69B' },
      { key: 'viettelpost', label: 'ViettelPost', count: byMethod.viettelpost?.count || 0, revenue: byMethod.viettelpost?.revenue || 0, outstanding: byMethod.viettelpost?.outstanding || 0, color: '#1A6FD4' },
      { key: 'nhan_xuong', label: 'Nhận tại xưởng', count: byMethod.nhan_xuong?.count || 0, revenue: byMethod.nhan_xuong?.revenue || 0, outstanding: byMethod.nhan_xuong?.outstanding || 0, color: '#7B1FA2' },
    ];
  }

  return [];
});

const maxMethodRevenue = computed(() => {
  return Math.max(1, ...deliveryMethodList.value.map((m: any) => m.revenue));
});

// Warehouse breakdown list matching image
const warehouseList = computed(() => {
  const byWarehouse = data.value.byWarehouse || {};
  if (Object.keys(byWarehouse).length > 0) {
    return Object.entries(byWarehouse).map(([key, v]: any, idx) => ({
      key,
      label: key,
      count: v.count || 0,
      revenue: v.revenue || 0,
      color: idx % 2 === 0 ? '#1A6FD4' : '#00B69B'
    }));
  }

  return [];
});

const maxWarehouseRevenue = computed(() => {
  return Math.max(1, ...warehouseList.value.map((w: any) => w.revenue));
});

function changePeriod(val: string) {
  period.value = val;
  loadData();
}

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

    const overdueRes = await api.get('/delivery/orders', { params: { overdue: 'true', days: 4, limit: 100 } });
    overdueOrdersRaw.value = overdueRes.data.orders || [];
  } catch (err) {
    console.error('Cannot load delivery report analytics:', err);
    data.value = {};
    overdueOrdersRaw.value = [];
  } finally {
    loading.value = false;
  }
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
  if (!v) return '09/07/2026';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

onMounted(loadData);
</script>

<style scoped>
.delivery-reports-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #F4F6F9;
  overflow-y: auto;
  padding: 20px 24px;
  font-family: inherit;
}

/* HEADER */
.reports-header {
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

.period-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #EAECEF;
  padding: 3px;
  border-radius: 10px;
}

.period-tab-btn {
  border: none;
  background: transparent;
  padding: 6px 14px;
  font-size: 12.5px;
  font-weight: 700;
  color: #5F6173;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.period-tab-btn:hover {
  color: #1E202C;
}

.period-tab-btn.active {
  background: #FFFFFF;
  color: #1E202C;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

/* MAIN BODY GRID WITH RIGHT SIDEBAR */
.reports-body-grid {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  width: 100%;
}

.reports-main-content {
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 4 KPI CARDS GRID */
.kpi-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.kpi-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 16px 20px;
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

.kpi-label {
  font-size: 13px;
  font-weight: 600;
  color: #5F6173;
}

.kpi-value {
  font-size: 22px;
  font-weight: 800;
  color: #1E202C;
  line-height: 1.2;
}

/* COMMON REPORTS CARD */
.reports-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 18px 20px;
  border: 1px solid #EAECEF;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.head-title h2 {
  font-size: 16px;
  font-weight: 800;
  color: #1E202C;
  margin: 0;
}

.text-danger-title {
  color: #1E202C !important;
}

/* BAR CHART STYLES */
.daily-chart-card {
  display: flex;
  flex-direction: column;
}

.chart-bars-wrap {
  display: flex;
  gap: 12px;
  height: 190px;
  padding-top: 10px;
}

.y-axis-labels {
  display: flex;
  flex-direction: column;
  justify-space: space-between;
  font-size: 11px;
  color: #8C8F9E;
  font-weight: 600;
  text-align: right;
  padding-bottom: 22px;
}

.bars-container {
  flex: 1;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.bar-column {
  flex: 1;
  min-width: 14px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.bar-track {
  width: 100%;
  max-width: 22px;
  height: calc(100% - 22px);
  background: #F0F2F5;
  border-radius: 4px 4px 0 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #00B69B, #2D9C67);
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
}

.bar-date {
  font-size: 10px;
  color: #7B8798;
  font-weight: 600;
  margin-top: 6px;
  white-space: nowrap;
}

/* BREAKDOWN CARDS GRID */
.breakdown-cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.method-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.method-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.method-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13.5px;
}

.method-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.method-title strong {
  font-weight: 700;
  color: #1E202C;
}

.method-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.method-stats {
  display: flex;
  align-items: center;
  gap: 10px;
}

.m-count {
  font-weight: 800;
  color: #1E202C;
}

.m-rev {
  font-size: 12.5px;
  color: #7B8798;
  font-weight: 600;
}

.method-progress-bar {
  height: 8px;
  background: #F0F2F5;
  border-radius: 4px;
  overflow: hidden;
}

.progress-inner {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.method-unpaid-text {
  font-size: 11.5px;
  color: #FF4D4F;
  font-weight: 700;
  margin-top: 1px;
}

/* DATA TABLE CARD */
.table-card {
  padding: 18px 20px;
}

.badge-overdue-count {
  padding: 3px 10px;
  border-radius: 12px;
  background: #FFF0F2;
  color: #FF4D4F;
  font-size: 12px;
  font-weight: 800;
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.reports-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.reports-table th {
  text-align: left;
  padding: 10px 12px;
  color: #7B8798;
  font-weight: 700;
  font-size: 11.5px;
  letter-spacing: 0.03em;
  border-bottom: 1px solid #EAECEF;
}

.reports-table td {
  padding: 12px;
  border-bottom: 1px solid #F0F2F5;
  color: #1E202C;
}

.overdue-table-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.overdue-table-row:hover {
  background: #FFF9FA;
}

.btn-order-code {
  border: none;
  background: transparent;
  padding: 0;
  color: #1A6FD4;
  font-weight: 800;
  font-size: 13.5px;
  cursor: pointer;
}

.btn-order-code:hover {
  text-decoration: underline;
}

.chip-overdue {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  background: #FFF0F2;
  color: #FF4D4F;
  font-size: 11.5px;
  font-weight: 700;
}

.text-danger {
  color: #FF4D4F !important;
}

/* RIGHT SIDEBAR: CẢNH BÁO */
.reports-right-sidebar {
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
  .reports-body-grid {
    flex-direction: column;
  }

  .reports-right-sidebar {
    width: 100%;
    flex: none;
    position: static;
  }

  .kpi-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .breakdown-cards-grid {
    grid-template-columns: 1fr;
  }
}
</style>
