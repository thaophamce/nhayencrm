<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="orders-overview-container">
    <!-- KHU VỰC NỘI DUNG CHÍNH (BÊN TRÁI) -->
    <div class="overview-left-main">
      <!-- Header & Bộ chọn tháng -->
      <div class="overview-header-card">
        <div class="header-titles">
          <h2 class="overview-title">Tổng quan đơn hàng thiết kế</h2>
          <p class="overview-subtitle">Theo dõi tiến độ, phân công thiết kế thiệp cưới và hiệu suất xử lý đơn hàng.</p>
        </div>

        <div class="month-selector-wrap">
          <input v-model="selectedMonth" type="month" class="month-input" />
        </div>
      </div>

      <div v-if="loading" class="overview-loading">
        <v-progress-circular indeterminate color="#2F80ED" size="32" />
        <span>Đang tải số liệu thống kê...</span>
      </div>

      <template v-else>
        <!-- 5 THẺ CHỈ SỐ KPI VỚI THIẾT KẾ GRID ĐỒNG ĐỀU (KHÔNG BỊ XUỐNG DÒNG LẺ) -->
        <div class="kpi-cards-grid">
          <!-- CARD 1: TỔNG ĐƠN -->
          <div class="kpi-box box-blue">
            <div class="kpi-top">
              <div class="kpi-icon icon-blue">
                <v-icon size="18" color="#1A6FD4">mdi-package-variant-closed</v-icon>
              </div>
              <span class="kpi-label">TỔNG ĐƠN</span>
            </div>
            <div class="kpi-value-row">
              <span class="kpi-number">{{ stats?.total || 0 }}</span>
              <small class="kpi-unit">đơn</small>
            </div>
            <div class="kpi-bar-bg">
              <div class="kpi-bar-fill bar-blue" style="width: 100%;"></div>
            </div>
          </div>

          <!-- CARD 2: CHƯA DEMO -->
          <div class="kpi-box box-orange">
            <div class="kpi-top">
              <div class="kpi-icon icon-orange">
                <v-icon size="18" color="#F57C00">mdi-clock-outline</v-icon>
              </div>
              <span class="kpi-label">CHƯA DEMO</span>
            </div>
            <div class="kpi-value-row">
              <span class="kpi-number text-orange">{{ stats?.byStatus?.demo || 0 }}</span>
              <small class="kpi-unit">đơn</small>
            </div>
            <div class="kpi-bar-bg">
              <div class="kpi-bar-fill bar-orange" :style="{ width: `${getPercent('demo')}%` }"></div>
            </div>
          </div>

          <!-- CARD 3: ĐANG THIẾT KẾ -->
          <div class="kpi-box box-azure">
            <div class="kpi-top">
              <div class="kpi-icon icon-azure">
                <v-icon size="18" color="#2F80ED">mdi-palette-outline</v-icon>
              </div>
              <span class="kpi-label">ĐANG THIẾT KẾ</span>
            </div>
            <div class="kpi-value-row">
              <span class="kpi-number text-azure">{{ stats?.byStatus?.designing || 0 }}</span>
              <small class="kpi-unit">đơn</small>
            </div>
            <div class="kpi-bar-bg">
              <div class="kpi-bar-fill bar-azure" :style="{ width: `${getPercent('designing')}%` }"></div>
            </div>
          </div>

          <!-- CARD 4: CHỐT IN -->
          <div class="kpi-box box-green">
            <div class="kpi-top">
              <div class="kpi-icon icon-green">
                <v-icon size="18" color="#34A853">mdi-check-decagram-outline</v-icon>
              </div>
              <span class="kpi-label">CHỐT IN</span>
            </div>
            <div class="kpi-value-row">
              <span class="kpi-number text-green">{{ stats?.byStatus?.approved || 0 }}</span>
              <small class="kpi-unit">đơn</small>
            </div>
            <div class="kpi-bar-bg">
              <div class="kpi-bar-fill bar-green" :style="{ width: `${getPercent('approved')}%` }"></div>
            </div>
          </div>

          <!-- CARD 5: KHÁCH HUỶ -->
          <div class="kpi-box box-red">
            <div class="kpi-top">
              <div class="kpi-icon icon-red">
                <v-icon size="18" color="#E5484D">mdi-close-circle-outline</v-icon>
              </div>
              <span class="kpi-label">KHÁCH HUỶ</span>
            </div>
            <div class="kpi-value-row">
              <span class="kpi-number text-red">{{ stats?.byStatus?.cancelled || 0 }}</span>
              <small class="kpi-unit">đơn</small>
            </div>
            <div class="kpi-bar-bg">
              <div class="kpi-bar-fill bar-red" :style="{ width: `${getPercent('cancelled')}%` }"></div>
            </div>
          </div>
        </div>

        <!-- BIỂU ĐỒ KHU VỰC: ĐƠN TẠO THEO NGÀY & TỶ LỆ TRẠNG THÁI -->
        <div class="charts-grid-row">
          <!-- BIỂU ĐỒ NĂNG SUẤT ĐƠN THEO NGÀY -->
          <div class="chart-card chart-card-left">
            <div class="chart-header">
              <div class="chart-title">
                <v-icon size="18" color="#1A6FD4">mdi-chart-line</v-icon>
                <span>Đơn tạo theo ngày trong tháng</span>
              </div>
              <span class="chart-peak-badge" v-if="peakDailyCount > 0">
                Cao nhất: <strong>{{ peakDailyCount }} đơn/ngày</strong>
              </span>
            </div>

            <div class="chart-canvas-wrapper">
              <Line v-if="lineData" :data="lineData" :options="lineOptions" />
              <div v-else class="empty-chart-state">Không có dữ liệu đơn hàng tạo trong tháng này</div>
            </div>
          </div>

          <!-- BIỂU ĐỒ TỶ LỆ TRẠNG THÁI -->
          <div class="chart-card chart-card-right">
            <div class="chart-header">
              <div class="chart-title">
                <v-icon size="18" color="#F57C00">mdi-chart-pie</v-icon>
                <span>Tỷ lệ trạng thái đơn</span>
              </div>
            </div>

            <div class="doughnut-content-row">
              <div class="doughnut-canvas-wrap">
                <Doughnut v-if="donutData" :data="donutData" :options="donutOptions" />
                <div v-else class="empty-chart-state">Chưa có dữ liệu</div>
              </div>

              <!-- LEGEND TÙY CHỈNH HIỆN ĐẠI (KHÔNG BỊ TRÀN CHỮ) -->
              <div class="custom-legend-list">
                <div
                  v-for="st in statusBreakdown"
                  :key="st.key"
                  class="legend-item-row"
                >
                  <div class="legend-info">
                    <span class="legend-dot" :style="{ background: st.color }"></span>
                    <span class="legend-name">{{ st.label }}</span>
                  </div>
                  <div class="legend-stats">
                    <strong>{{ st.count }} đơn</strong>
                    <small>({{ st.percent }}%)</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- CỘT BÊN PHẢI CẢNH BÁO -->
    <aside class="overview-right-sidebar">
      <OrderAlertPanel
        ref="alertPanelRef"
        @edit="onEditOrder"
        @changed="onAlertChanged"
      />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Line, Doughnut } from 'vue-chartjs';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { api } from '@/api/index';
import { ORDER_STATUS_OPTIONS } from '@/constants/order-status';
import OrderAlertPanel from '@/components/orders/OrderAlertPanel.vue';
import { getOrderStatsMonthValue, selectMonthlyOrderOverviewStats } from '@/utils/order-stats-time';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

const emit = defineEmits<{ (e: 'edit', order: any): void }>();

const STATUS_HEX: Record<string, string> = {
  demo: '#F57C00',
  designing: '#2F80ED',
  approved: '#34A853',
  cancelled: '#E5484D',
};

const selectedMonth = ref(getOrderStatsMonthValue());
const loading = ref(false);
const stats = ref<any>(null);
const alertPanelRef = ref<any>(null);

onMounted(loadStats);
watch(selectedMonth, loadStats);

async function loadStats() {
  loading.value = true;
  try {
    const res = await api.get<any>('/orders/stats', { params: { month: selectedMonth.value } });
    stats.value = selectMonthlyOrderOverviewStats(res.data);
    alertPanelRef.value?.refresh();
  } catch (err) {
    console.error('Cannot load order stats:', err);
    stats.value = null;
  } finally {
    loading.value = false;
  }
}

function onEditOrder(order: any) {
  emit('edit', order);
}

function onAlertChanged() {
  loadStats();
}

function getPercent(statusKey: string): number {
  const total = stats.value?.total || 0;
  if (!total) return 0;
  const count = stats.value?.byStatus?.[statusKey] || 0;
  return Math.min(100, Math.round((count / total) * 100));
}

const peakDailyCount = computed(() => {
  const daily = stats.value?.daily || [];
  return daily.length ? Math.max(...daily) : 0;
});

const statusBreakdown = computed(() => {
  const total = stats.value?.total || 0;
  const byStatus = stats.value?.byStatus || {};

  return ORDER_STATUS_OPTIONS.map(o => {
    const count = byStatus[o.value] || 0;
    const percent = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
    return {
      key: o.value,
      label: o.label,
      count,
      percent,
      color: STATUS_HEX[o.value] || '#8C8F9E',
    };
  });
});

const lineData = computed(() => {
  const s = stats.value;
  if (!s?.dailyLabels?.length) return null;

  return {
    labels: s.dailyLabels,
    datasets: [{
      label: 'Đơn mới tạo',
      data: s.daily,
      borderColor: '#2F80ED',
      borderWidth: 2.5,
      backgroundColor: (context: any) => {
        const chart = context.chart;
        const { ctx, chartArea } = chart;
        if (!chartArea) return 'rgba(47, 128, 237, 0.15)';
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, 'rgba(47, 128, 237, 0.25)');
        gradient.addColorStop(1, 'rgba(47, 128, 237, 0.01)');
        return gradient;
      },
      fill: true,
      tension: 0.35,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      pointBackgroundColor: '#2F80ED',
      pointBorderColor: '#FFFFFF',
      pointBorderWidth: 1.5,
    }],
  };
});

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1E202C',
      titleFont: { size: 12, weight: 'bold' as const },
      bodyFont: { size: 12 },
      padding: 10,
      cornerRadius: 8,
    }
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: '#7B8798' },
    },
    y: {
      beginAtZero: true,
      grid: { color: '#F1F5F9' },
      ticks: { precision: 0, font: { size: 11 }, color: '#7B8798' },
    }
  },
};

const donutData = computed(() => {
  const byStatus = stats.value?.byStatus;
  if (!byStatus) return null;
  const entries = ORDER_STATUS_OPTIONS.filter(o => (byStatus[o.value] || 0) > 0);
  if (!entries.length) return null;

  return {
    labels: entries.map(o => o.label),
    datasets: [{
      data: entries.map(o => byStatus[o.value]),
      backgroundColor: entries.map(o => STATUS_HEX[o.value] || '#8C8F9E'),
      borderWidth: 2,
      borderColor: '#FFFFFF',
      hoverOffset: 4,
    }],
  };
});

const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '72%',
  plugins: {
    legend: { display: false }, // Use custom HTML legend below
    tooltip: {
      backgroundColor: '#1E202C',
      padding: 10,
      cornerRadius: 8,
    }
  },
};
</script>

<style scoped>
.orders-overview-container {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  width: 100%;
  padding-bottom: 20px;
}

.overview-left-main {
  flex: 1 1 0%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-right-sidebar {
  width: 320px;
  flex: 0 0 320px;
  min-width: 0;
  position: sticky;
  top: 0;
}

/* HEADER CARD */
.overview-header-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 16px 20px;
  border: 1px solid #EAECEF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.overview-title {
  font-size: 18px;
  font-weight: 800;
  color: #1A6FD4;
  margin: 0;
}

.overview-subtitle {
  font-size: 12.5px;
  color: #64748B;
  margin: 2px 0 0;
}

.month-selector-wrap {
  width: 190px;
}

.month-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  font-size: 14px;
  color: #1E202C;
  outline: none;
  background: #fff;
  cursor: pointer;
}
.month-input:focus {
  border-color: #2F80ED;
  box-shadow: 0 0 0 2px rgba(47,128,237,0.15);
}

.overview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 0;
  color: #64748B;
  font-size: 13.5px;
}

/* 5 KPI CARDS GRID */
.kpi-cards-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.kpi-box {
  background: #FFFFFF;
  border-radius: 14px;
  padding: 14px 16px;
  border: 1px solid #EAECEF;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.kpi-box:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.box-blue { border-top: 3px solid #1A6FD4; }
.box-orange { border-top: 3px solid #F57C00; }
.box-azure { border-top: 3px solid #2F80ED; }
.box-green { border-top: 3px solid #34A853; }
.box-red { border-top: 3px solid #E5484D; }

.kpi-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kpi-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-blue { background: #EBF3FF; }
.icon-orange { background: #FFF4E5; }
.icon-azure { background: #EBF3FF; }
.icon-green { background: #E6F4EA; }
.icon-red { background: #FFE6E6; }

.kpi-label {
  font-size: 11px;
  font-weight: 800;
  color: #64748B;
  letter-spacing: 0.03em;
}

.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 2px;
}

.kpi-number {
  font-size: 22px;
  font-weight: 800;
  color: #1E202C;
  line-height: 1;
}

.kpi-unit {
  font-size: 11px;
  color: #94A3B8;
  font-weight: 600;
}

.text-orange { color: #F57C00 !important; }
.text-azure { color: #2F80ED !important; }
.text-green { color: #34A853 !important; }
.text-red { color: #E5484D !important; }

.kpi-bar-bg {
  width: 100%;
  height: 4px;
  background: #F1F5F9;
  border-radius: 99px;
  overflow: hidden;
  margin-top: 4px;
}

.kpi-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.3s ease;
}

.bar-blue { background: #1A6FD4; }
.bar-orange { background: #F57C00; }
.bar-azure { background: #2F80ED; }
.bar-green { background: #34A853; }
.bar-red { background: #E5484D; }

/* CHARTS ROW */
.charts-grid-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
}

.chart-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 18px;
  border: 1px solid #EAECEF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.chart-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 800;
  color: #1E202C;
}

.chart-peak-badge {
  font-size: 11.5px;
  color: #64748B;
  background: #F1F5F9;
  padding: 4px 10px;
  border-radius: 8px;
}

.chart-canvas-wrapper {
  height: 270px;
  position: relative;
}

.empty-chart-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94A3B8;
  font-size: 13px;
}

/* DOUGHNUT & CUSTOM LEGEND */
.doughnut-content-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.doughnut-canvas-wrap {
  width: 170px;
  height: 170px;
  position: relative;
}

.custom-legend-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.legend-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 8px;
  background: #F8FAFC;
}

.legend-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.legend-name {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}

.legend-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.legend-stats strong {
  color: #1E202C;
}

.legend-stats small {
  color: #64748B;
}

@media (max-width: 1280px) {
  .orders-overview-container {
    flex-direction: column;
  }
  .overview-right-sidebar {
    width: 100%;
    flex: none;
    position: static;
  }
  .charts-grid-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1100px) {
  .kpi-cards-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 650px) {
  .kpi-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
