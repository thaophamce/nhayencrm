<template>
  <section class="delivery-business-page">
    <!-- HEADER -->
    <header class="business-header">
      <div class="header-left">
        <h1 class="header-title">Báo cáo kết quả kinh doanh</h1>
        <p class="header-subtitle">Tổng quan hiệu quả hoạt động kinh doanh</p>
      </div>

      <div class="header-right">
        <div class="month-navigator">
          <button type="button" class="nav-arrow-btn" @click="prevMonth">
            <v-icon size="18">mdi-chevron-left</v-icon>
          </button>
          <span class="current-month-text">Tháng {{ selectedMonthStr }}</span>
          <button type="button" class="nav-arrow-btn" :disabled="isAtMaxMonth" @click="nextMonth">
            <v-icon size="18">mdi-chevron-right</v-icon>
          </button>
        </div>

        <button type="button" class="export-btn" @click="exportReport">
          <v-icon size="16">mdi-tray-arrow-up</v-icon>
          <span>Xuất báo cáo</span>
        </button>
      </div>
    </header>

    <!-- 6 TOP KPI METRIC CARDS ROW -->
    <div class="top-kpis-grid">
      <!-- CARD 1: DOANH THU -->
      <div class="kpi-card card-blue">
        <div class="kpi-head">
          <div class="kpi-icon-wrap icon-blue">
            <v-icon size="18" color="#1A6FD4">mdi-video-outline</v-icon>
          </div>
          <span class="kpi-title">DOANH THU</span>
        </div>
        <div class="kpi-value">{{ formatMoney(displayData.revenue) }}</div>
        <div class="kpi-sub" :class="changeClass(revenueChange)">{{ formatChange(revenueChange) }} so với tháng trước</div>
        <div class="kpi-sparkline spark-blue"></div>
      </div>

      <!-- CARD 2: TỔNG DOANH THU NĂM -->
      <div class="kpi-card card-dark">
        <div class="kpi-head">
          <div class="kpi-icon-wrap icon-dark">
            <v-icon size="18" color="#334155">mdi-chart-line</v-icon>
          </div>
          <span class="kpi-title">TỔNG DOANH THU NĂM</span>
        </div>
        <div class="kpi-value">{{ formatMoney(displayData.yearlyRevenue) }}</div>
        <div class="kpi-sub text-muted">&nbsp;</div>
        <div class="kpi-sparkline spark-dark"></div>
      </div>

      <!-- CARD 3: LỢI NHUẬN GỘP -->
      <div class="kpi-card card-green">
        <div class="kpi-head">
          <div class="kpi-icon-wrap icon-green">
            <v-icon size="18" color="#00B69B">mdi-chart-bar</v-icon>
          </div>
          <span class="kpi-title">LỢI NHUẬN GỘP</span>
        </div>
        <div class="kpi-value">{{ formatMoney(displayData.grossProfit) }}</div>
        <div class="kpi-sub" :class="changeClass(profitChange)">{{ formatChange(profitChange) }} so với tháng trước</div>
        <div class="kpi-sparkline spark-green"></div>
      </div>

      <!-- CARD 4: LỢI NHUẬN RÒNG -->
      <div class="kpi-card card-purple">
        <div class="kpi-head">
          <div class="kpi-icon-wrap icon-purple">
            <v-icon size="18" color="#7B1FA2">mdi-chart-bar</v-icon>
          </div>
          <span class="kpi-title">LỢI NHUẬN RÒNG</span>
        </div>
        <div class="kpi-value">{{ formatMoney(displayData.netProfit) }}</div>
        <div class="kpi-sub" :class="changeClass(profitChange)">{{ formatChange(profitChange) }} so với tháng trước</div>
        <div class="kpi-sparkline spark-purple"></div>
      </div>

      <!-- CARD 5: TỶ SUẤT LỢI NHUẬN -->
      <div class="kpi-card card-gold">
        <div class="kpi-head">
          <div class="kpi-icon-wrap icon-gold">
            <v-icon size="18" color="#FAAD14">mdi-percent</v-icon>
          </div>
          <span class="kpi-title">TỶ SUẤT LỢI NHUẬN</span>
        </div>
        <div class="kpi-value">{{ displayData.profitMargin.toFixed(1) }}%</div>
        <div class="kpi-sub" :class="changeClass(marginChange)">{{ formatChange(marginChange) }} so với tháng trước</div>
      </div>

      <!-- CARD 6: ĐƠN HÀNG -->
      <div class="kpi-card card-cyan">
        <div class="kpi-head">
          <div class="kpi-icon-wrap icon-cyan">
            <v-icon size="18" color="#0284C7">mdi-cart-outline</v-icon>
          </div>
          <span class="kpi-title">ĐƠN HÀNG</span>
        </div>
        <div class="kpi-value">{{ formatNumber(displayData.totalOrders) }}</div>
        <div class="kpi-sub" :class="changeClass(orderChange)">{{ formatChange(orderChange) }} so với tháng trước</div>
        <div class="kpi-sparkline spark-cyan"></div>
      </div>
    </div>

    <!-- MIDDLE SECTION: 3 CARDS -->
    <div class="middle-cards-grid">
      <!-- BÁO CÁO DOANH THU (BAR CHART 6 MONTHS) -->
      <div class="biz-card chart-card">
        <div class="card-head">
          <h2>BÁO CÁO DOANH THU</h2>
        </div>

        <div class="chart-content-wrap">
          <div class="y-axis-labels">
            <span>600M</span>
            <span>400M</span>
            <span>200M</span>
            <span>0</span>
          </div>

          <div class="bars-flex-container">
            <div
              v-for="(b, idx) in monthlyRevenueBars"
              :key="idx"
              class="month-bar-item"
            >
              <div class="month-bar-fill" :style="{ height: `${b.percent}%` }"></div>
              <span class="month-bar-label">{{ b.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- CƠ CẤU CHI PHÍ -->
      <div class="biz-card cost-card">
        <div class="card-head d-flex align-center justify-space-between">
          <h2>CƠ CẤU CHI PHÍ</h2>
          <small class="text-muted font-weight-bold" v-if="totalExpense > 0">
            Tổng: {{ formatMoney(totalExpense) }}
          </small>
        </div>

        <div v-if="costPieData" class="cost-chart-wrap">
          <Doughnut :data="costPieData" :options="costPieOptions" style="height: 170px;" />
        </div>
        <div v-else class="cost-empty-content">
          <span class="empty-text">Chưa có dữ liệu chi phí</span>
        </div>
      </div>

      <!-- BÁO CÁO LỢI NHUẬN – 6 THÁNG -->
      <div class="biz-card profit-card">
        <div class="card-head">
          <h2>BÁO CÁO LỢI NHUẬN – 6 THÁNG</h2>
        </div>

        <div class="profit-chart-wrap">
          <div class="y-axis-labels">
            <span>600M</span>
            <span>400M</span>
            <span>200M</span>
            <span>0</span>
          </div>

          <div class="profit-svg-area">
            <svg viewBox="0 0 320 120" class="profit-lines-svg">
              <!-- Grid lines -->
              <line x1="0" y1="20" x2="320" y2="20" stroke="#F1F5F9" stroke-dasharray="3,3" />
              <line x1="0" y1="50" x2="320" y2="50" stroke="#F1F5F9" stroke-dasharray="3,3" />
              <line x1="0" y1="80" x2="320" y2="80" stroke="#F1F5F9" stroke-dasharray="3,3" />

              <!-- Cost Line (Red) -->
              <path
                d="M 10,70 Q 60,68 110,75 T 210,85 T 310,88"
                fill="none"
                stroke="#FF4D4F"
                stroke-width="2"
              />

              <!-- Revenue Line (Blue) -->
              <path
                d="M 10,88 Q 60,50 110,40 T 210,55 T 310,65"
                fill="none"
                stroke="#2F80ED"
                stroke-width="2"
              />

              <!-- Profit Line (Green) -->
              <path
                d="M 10,110 Q 60,90 110,88 T 210,92 T 310,95"
                fill="none"
                stroke="#00B69B"
                stroke-width="2"
              />
            </svg>

            <div class="x-axis-month-labels">
              <span v-for="month in monthlyRevenueBars" :key="month.label">{{ month.label }}</span>
            </div>
          </div>
        </div>

        <div class="profit-legend">
          <span class="legend-dot dot-red">Chi phí</span>
          <span class="legend-dot dot-blue">Doanh thu</span>
          <span class="legend-dot dot-green">Lợi nhuận</span>
        </div>
      </div>
    </div>

    <!-- BOTTOM SECTION: 3 CARDS -->
    <div class="bottom-tables-grid">
      <!-- CHI PHÍ THEO DANH MỤC -->
      <div class="biz-card">
        <div class="card-head-sub font-weight-bold">
          <div>
            <h2>CHI PHÍ THEO DANH MỤC</h2>
            <small class="text-italic-muted">Click vào ô để chỉnh sửa</small>
          </div>
        </div>

        <div class="table-wrap">
          <table class="biz-table">
            <thead>
              <tr>
                <th class="text-left" style="width: 28%;">Danh mục</th>
                <th class="text-center" style="width: 36%;">Chi phí (đ)</th>
                <th class="text-center" style="width: 18%;">Tỷ trọng</th>
                <th class="text-center" style="width: 18%;">Biến động</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in categoryCosts" :key="idx">
                <td class="text-left font-weight-medium">{{ row.category }}</td>
                <td class="text-center editable-value" @click="beginEdit('expense', row.id, row.value)">
                  <input
                    v-if="editingCell === `expense:${row.id}`"
                    v-model="editingValue"
                    inputmode="numeric"
                    @click.stop
                    @blur="commitEdit"
                    @keydown.enter.prevent="commitEdit"
                    @keydown.esc.prevent="cancelEdit"
                  >
                  <span v-else class="text-center">{{ formatMoney(row.value) }}</span>
                </td>
                <td class="text-center">{{ row.share.toFixed(1) }}%</td>
                <td class="text-center font-weight-bold" :class="changeClass(row.change)">
                  {{ formatChange(row.change) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- CHĂM SÓC KHÁCH HÀNG -->
      <div class="biz-card">
        <div class="card-head-sub font-weight-bold">
          <div>
            <h2>CHĂM SÓC KHÁCH HÀNG</h2>
            <small class="text-italic-muted">Click vào ô để chỉnh sửa</small>
          </div>
        </div>

        <div class="table-wrap">
          <table class="biz-table">
            <thead>
              <tr>
                <th class="text-left" style="width: 48%;">Chỉ số</th>
                <th class="text-center" style="width: 32%;">Giá trị</th>
                <th class="text-center" style="width: 20%;">%</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in crmMetrics" :key="idx">
                <td class="text-left font-weight-medium">{{ row.label }}</td>
                <td class="text-center editable-value" @click="beginEdit('customerCare', row.id, row.value)">
                  <input
                    v-if="editingCell === `customerCare:${row.id}`"
                    v-model="editingValue"
                    inputmode="numeric"
                    @click.stop
                    @blur="commitEdit"
                    @keydown.enter.prevent="commitEdit"
                    @keydown.esc.prevent="cancelEdit"
                  >
                  <span v-else class="text-center">{{ row.money ? formatMoney(row.value) : formatNumber(row.value) }}</span>
                </td>
                <td class="text-center font-weight-bold" :class="changeClass(row.change)">{{ formatChange(row.change) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- BÁO CÁO ĐƠN HÀNG -->
      <div class="biz-card order-report-card">
        <div class="card-head">
          <h2>BÁO CÁO ĐƠN HÀNG</h2>
        </div>

        <div class="order-status-boxes">
          <div class="status-box box-blue">
            <span class="box-label">Tổng đơn hàng</span>
            <div class="box-num">{{ formatNumber(displayData.totalOrders) }}</div>
            <div class="box-sub" :class="changeClass(orderChange)">{{ formatChange(orderChange) }} so với tháng trước</div>
          </div>

          <div class="status-box box-green">
            <span class="box-label">Chốt in</span>
            <div class="box-num">{{ formatNumber(displayData.chotIn) }}</div>
          </div>

          <div class="status-box box-gold">
            <span class="box-label">Đang thiết kế</span>
            <div class="box-num">{{ formatNumber(displayData.dangThietKe) }}</div>
            <div class="box-sub">&nbsp;</div>
          </div>

          <div class="status-box box-gray">
            <span class="box-label">Khách huỷ</span>
            <div class="box-num">{{ formatNumber(displayData.khachHuy) }}</div>
            <div class="box-sub">&nbsp;</div>
          </div>
        </div>

        <div class="status-legend-footer">
          <span>Tỷ lệ đơn theo trạng thái</span>
          <div class="legend-dots-row">
            <span class="legend-dot dot-green">Chốt in</span>
            <span class="legend-dot dot-blue">Đang thiết kế</span>
          </div>
        </div>
      </div>
    </div>

    <!-- FOOTER SUMMARY PILL CARDS -->
    <footer class="bottom-pills-row">
      <div class="pill-card pill-blue">
        <div class="pill-icon icon-blue">
          <v-icon size="16" color="#1A6FD4">mdi-finance</v-icon>
        </div>
        <span class="pill-label">DOANH THU TR. / ĐƠN</span>
        <strong class="pill-val">{{ formatMoney(displayData.avgRevenuePerOrder) }}</strong>
      </div>

      <div class="pill-card pill-red">
        <div class="pill-icon icon-red">
          <v-icon size="16" color="#FF4D4F">mdi-cash-minus</v-icon>
        </div>
        <span class="pill-label">CHI PHÍ TR. / ĐƠN</span>
        <strong class="pill-val">{{ formatMoney(displayData.avgExpensePerOrder) }}</strong>
      </div>

      <div class="pill-card pill-green">
        <div class="pill-icon icon-green">
          <v-icon size="16" color="#00B69B">mdi-wallet-plus</v-icon>
        </div>
        <span class="pill-label">LỢI NHUẬN TR. / ĐƠN</span>
        <strong class="pill-val">{{ formatMoney(displayData.avgProfitPerOrder) }}</strong>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Doughnut } from 'vue-chartjs';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { BUSINESS_REPORT_MAX_MONTH, BUSINESS_REPORT_MONTHS } from '@/data/business-report-through-june-2026';

ChartJS.register(ArcElement, Tooltip, Legend);

const currentYear = ref(2026);
const currentMonth = ref(6);
type EditableSection = 'expense' | 'customerCare';
type MonthOverrides = Record<string, { expense?: Record<string, number>; customerCare?: Record<string, number> }>;
const STORAGE_KEY = 'delivery-business-report-manual-values-v1';
const manualOverrides = ref<MonthOverrides>(readOverrides());
const editingCell = ref('');
const editingValue = ref('');
const editingSection = ref<EditableSection | null>(null);
const editingField = ref('');

const selectedMonthStr = computed(() => {
  return `${String(currentMonth.value).padStart(2, '0')} ${currentYear.value}`;
});

const monthKey = computed(() => `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}`);
const previousMonthKey = computed(() => {
  const date = new Date(currentYear.value, currentMonth.value - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
});
const source = computed(() => {
  const base = BUSINESS_REPORT_MONTHS[monthKey.value] || { revenue: 0, orderCount: 0, expenses: {}, customerCare: {} };
  const overrides = manualOverrides.value[monthKey.value] || {};
  return {
    ...base,
    expenses: { ...base.expenses, ...(overrides.expense || {}) },
    customerCare: { ...base.customerCare, ...(overrides.customerCare || {}) },
  };
});
const previous = computed(() => {
  const base = BUSINESS_REPORT_MONTHS[previousMonthKey.value];
  if (!base) return undefined;
  const overrides = manualOverrides.value[previousMonthKey.value] || {};
  return {
    ...base,
    expenses: { ...base.expenses, ...(overrides.expense || {}) },
    customerCare: { ...base.customerCare, ...(overrides.customerCare || {}) },
  };
});
const totalExpense = computed(() => Object.values(source.value.expenses).reduce((sum, value) => sum + value, 0));
const grossProfit = computed(() => source.value.revenue - totalExpense.value);
const yearlyRevenue = computed(() => Object.entries(BUSINESS_REPORT_MONTHS)
  .filter(([key]) => key.startsWith(`${currentYear.value}-`) && key <= monthKey.value)
  .reduce((sum, [, value]) => sum + value.revenue, 0));
const totalOrders = computed(() => Number(source.value.customerCare.tong_don_hang ?? source.value.orderCount));
const displayData = computed(() => ({
  revenue: source.value.revenue,
  yearlyRevenue: yearlyRevenue.value,
  grossProfit: grossProfit.value,
  netProfit: grossProfit.value,
  profitMargin: source.value.revenue ? (grossProfit.value / source.value.revenue) * 100 : 0,
  totalOrders: totalOrders.value,
  chotIn: Number(source.value.customerCare.chot_in ?? source.value.customerCare.don_hoan_tat ?? 0),
  dangThietKe: Number(source.value.customerCare.dang_thiet_ke ?? 0),
  khachHuy: Number(source.value.customerCare.khach_huy ?? 0),
  avgRevenuePerOrder: totalOrders.value ? source.value.revenue / totalOrders.value : 0,
  avgExpensePerOrder: totalOrders.value ? totalExpense.value / totalOrders.value : 0,
  avgProfitPerOrder: totalOrders.value ? grossProfit.value / totalOrders.value : 0,
}));
const change = (value: number, oldValue?: number) => oldValue ? ((value - oldValue) / oldValue) * 100 : null;
const revenueChange = computed(() => change(source.value.revenue, previous.value?.revenue));
const profitChange = computed(() => {
  if (!previous.value) return null;
  const oldExpense = Object.values(previous.value.expenses).reduce((sum, value) => sum + value, 0);
  return change(grossProfit.value, previous.value.revenue - oldExpense);
});
const marginChange = computed(() => {
  if (!previous.value?.revenue) return null;
  const oldExpense = Object.values(previous.value.expenses).reduce((sum, value) => sum + value, 0);
  return change(displayData.value.profitMargin, ((previous.value.revenue - oldExpense) / previous.value.revenue) * 100);
});
const orderChange = computed(() => change(totalOrders.value, Number(previous.value?.customerCare.tong_don_hang ?? previous.value?.orderCount)));
const isAtMaxMonth = computed(() => monthKey.value >= BUSINESS_REPORT_MAX_MONTH);

const monthlyRevenueBars = computed(() => {
  const rows = Object.entries(BUSINESS_REPORT_MONTHS).filter(([key]) => key <= monthKey.value).slice(-6);
  const max = Math.max(1, ...rows.map(([, value]) => value.revenue));
  return rows.map(([key, value]) => ({ label: `T${Number(key.slice(5))}/${key.slice(2, 4)}`, percent: (value.revenue / max) * 100 }));
});

const costDefinitions = [
  ['hoc-mon', 'Hóc Môn'], ['da-nang', 'Đà Nẵng'], ['tan-phu', 'Tân Phú'],
  ['quang-cao-fb', 'Quảng cáo FB'], ['luong', 'Lương'], ['viettel-post', 'Viettel Post'],
  ['dien', 'Điện'], ['van-phong', 'Văn phòng'], ['ke-toan-thue', 'Kế toán thuế'],
] as const;
const categoryCosts = computed(() => costDefinitions.map(([id, category]) => {
  const value = Number(source.value.expenses[id] || 0);
  return { id, category, value, share: totalExpense.value ? (value / totalExpense.value) * 100 : 0, change: change(value, previous.value?.expenses[id]) };
}));

const costPieData = computed(() => {
  const activeCosts = categoryCosts.value.filter(c => c.value > 0);
  if (!activeCosts.length) return null;
  const colors = ['#1A6FD4', '#00B69B', '#F57C00', '#7B1FA2', '#FAAD14', '#FF4D4F', '#0284C7', '#6366F1'];
  return {
    labels: activeCosts.map(c => c.category),
    datasets: [{
      data: activeCosts.map(c => c.value),
      backgroundColor: activeCosts.map((_, idx) => colors[idx % colors.length]),
      borderWidth: 2,
      borderColor: '#FFFFFF',
    }]
  };
});

const costPieOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        boxWidth: 10,
        padding: 8,
        font: { size: 10.5, weight: 'bold' as const },
        color: '#5F6173'
      }
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const val = ctx.raw || 0;
          return ` ${ctx.label}: ${new Intl.NumberFormat('vi-VN').format(val)} đ`;
        }
      }
    }
  }
};

const crmDefinitions = [
  ['so_dien_thoai_moi', 'Số điện thoại mới', false],
  ['khach_cu_nhan_tin', 'Số khách cũ nhắn tin tương tác lại', false],
  ['khach_hang_moi', 'Khách hàng mới', false],
  ['don_hoan_tat', 'Số đơn hoàn tất', false],
  ['chi_phi_1_khach', 'Chi phí để có 1 khách hàng', true],
  ['trung_binh_1_don', 'Trung bình 1 đơn', true],
  ['tong_ngan_sach', 'Tổng ngân sách tháng', true],
  ['chi_phi_1_tin_nhan', 'Chi phí 1 tin nhắn', true],
] as const;
const crmMetrics = computed(() => crmDefinitions.map(([id, label, money]) => {
  const value = Number(source.value.customerCare[id] || 0);
  return { id, label, money, value, change: change(value, previous.value?.customerCare[id]) };
}));

function readOverrides(): MonthOverrides {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function beginEdit(section: EditableSection, field: string, value: number) {
  editingSection.value = section;
  editingField.value = field;
  editingCell.value = `${section}:${field}`;
  editingValue.value = new Intl.NumberFormat('vi-VN').format(value);
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.editable-value input');
    input?.focus();
    input?.select();
  });
}

function parseManualNumber(value: string) {
  const digits = value.replace(/[^\d-]/g, '');
  return Math.max(0, Number(digits) || 0);
}

function commitEdit() {
  if (!editingSection.value || !editingField.value) return cancelEdit();
  const month = monthKey.value;
  const section = editingSection.value;
  const existing = manualOverrides.value[month] || {};
  manualOverrides.value = {
    ...manualOverrides.value,
    [month]: {
      ...existing,
      [section]: {
        ...(existing[section] || {}),
        [editingField.value]: parseManualNumber(editingValue.value),
      },
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(manualOverrides.value));
  cancelEdit();
}

function cancelEdit() {
  editingCell.value = '';
  editingValue.value = '';
  editingSection.value = null;
  editingField.value = '';
}

function prevMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
}

function nextMonth() {
  if (isAtMaxMonth.value) return;
  if (currentMonth.value === 12) {
    currentMonth.value = 1;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
}

function exportReport() {
  alert('Đang xuất báo cáo doanh thu...');
}

function formatMoney(val: any) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

function formatNumber(val: any) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('vi-VN').format(num);
}

function formatChange(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '▲' : '▼'} ${Math.abs(value).toFixed(1)}%`;
}

function changeClass(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'text-muted';
  return value >= 0 ? 'text-success' : 'text-danger';
}
</script>

<style scoped>
.delivery-business-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  min-height: 0;
  background: #F4F6F9;
  overflow-y: auto;
  padding: 20px 24px;
  font-family: inherit;
}

/* HEADER */
.business-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
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

.month-navigator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.nav-arrow-btn {
  border: none;
  background: transparent;
  padding: 2px;
  color: #5F6173;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.nav-arrow-btn:hover {
  color: #1E202C;
}

.current-month-text {
  font-size: 13px;
  font-weight: 800;
  color: #1E202C;
  min-width: 100px;
  text-align: center;
}

.export-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid #D0E2FF;
  background: #1A6FD4;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.export-btn:hover {
  opacity: 0.9;
}

/* TOP 6 KPI CARDS GRID */
.top-kpis-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
}

.kpi-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 14px 16px;
  border: 1px solid #EAECEF;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  overflow: hidden;
}

.kpi-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kpi-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-blue { background: #EBF3FF; }
.icon-dark { background: #F1F5F9; }
.icon-green { background: #E6F8F5; }
.icon-purple { background: #F3E5F5; }
.icon-gold { background: #FFFBE6; }
.icon-cyan { background: #E0F2FE; }

.kpi-title {
  font-size: 11px;
  font-weight: 800;
  color: #5F6173;
  letter-spacing: 0.02em;
}

.kpi-value {
  font-size: 18px;
  font-weight: 800;
  color: #1E202C;
  line-height: 1.25;
  margin-top: 4px;
}

.kpi-sub {
  font-size: 11px;
  font-weight: 700;
}

.text-danger { color: #FF4D4F; }
.text-success { color: #00B69B; }
.text-muted { color: #8C8F9E; }

.editable-value {
  cursor: text;
  border-radius: 5px;
  text-align: center;
}

.editable-value:hover {
  background: #fff8e7;
  box-shadow: inset 0 0 0 1px #f2d18a;
}

.editable-value span {
  display: inline-block;
  width: 100%;
  text-align: center;
}

.editable-value input {
  width: 100%;
  min-width: 90px;
  box-sizing: border-box;
  border: 1.5px solid #1a6fd4;
  border-radius: 5px;
  outline: none;
  padding: 4px 6px;
  background: #fff;
  color: #1e202c;
  font: inherit;
  font-weight: 700;
  text-align: center;
}

.kpi-sparkline {
  height: 18px;
  margin-top: 4px;
  border-radius: 4px;
  opacity: 0.4;
}

.spark-blue { background: linear-gradient(180deg, #1A6FD4, transparent); }
.spark-dark { background: linear-gradient(180deg, #475569, transparent); }
.spark-green { background: linear-gradient(180deg, #00B69B, transparent); }
.spark-purple { background: linear-gradient(180deg, #7B1FA2, transparent); }
.spark-cyan { background: linear-gradient(180deg, #0284C7, transparent); }

/* MIDDLE 3 CARDS GRID */
.middle-cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}

.biz-card {
  background: #FFFFFF;
  border-radius: 16px;
  padding: 18px 20px;
  border: 1px solid #EAECEF;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
}

.card-head {
  margin-bottom: 16px;
}

.card-head h2 {
  font-size: 14px;
  font-weight: 800;
  color: #1E202C;
  margin: 0;
  letter-spacing: 0.03em;
}

.card-head-sub h2 {
  font-size: 14px;
  font-weight: 800;
  color: #1E202C;
  margin: 0;
}

.text-italic-muted {
  font-size: 11px;
  color: #8C8F9E;
  font-style: italic;
}

/* BAR CHART (6 MONTHS) */
.chart-content-wrap {
  display: flex;
  gap: 12px;
  height: 180px;
  align-items: flex-end;
}

.y-axis-labels {
  display: flex;
  flex-direction: column;
  justify-space: space-between;
  font-size: 10px;
  color: #8C8F9E;
  font-weight: 600;
  height: 150px;
}

.bars-flex-container {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 150px;
}

.month-bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
  width: 32px;
}

.month-bar-fill {
  width: 100%;
  background: #2F80ED;
  border-radius: 6px 6px 0 0;
  transition: height 0.3s ease;
}

.month-bar-label {
  font-size: 11px;
  color: #7B8798;
  font-weight: 600;
  margin-top: 6px;
}

/* COST CARD */
.cost-chart-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  height: 180px;
}

.cost-empty-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}

.empty-text {
  font-size: 12px;
  color: #94A3B8;
  font-weight: 600;
}

/* PROFIT CARD */
.profit-chart-wrap {
  display: flex;
  gap: 10px;
  height: 150px;
}

.profit-svg-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.profit-lines-svg {
  width: 100%;
  height: 120px;
}

.x-axis-month-labels {
  display: flex;
  justify-content: space-around;
  font-size: 10.5px;
  color: #7B8798;
  font-weight: 600;
  margin-top: 4px;
}

.profit-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 10px;
  font-size: 11.5px;
  color: #5F6173;
  font-weight: 600;
}

.legend-dot {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-dot::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-red::before { background: #FF4D4F; }
.dot-blue::before { background: #2F80ED; }
.dot-green::before { background: #00B69B; }

/* BOTTOM 3 CARDS GRID */
.bottom-tables-grid {
  display: grid;
  grid-template-columns: 1.2fr 1.2fr 1fr;
  gap: 16px;
}

.table-wrap {
  margin-top: 10px;
  overflow-x: auto;
}

.biz-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.biz-table th {
  padding: 8px 10px;
  color: #7B8798;
  font-weight: 700;
  font-size: 11px;
  border-bottom: 1px solid #EAECEF;
}

.biz-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #F8FAFC;
  color: #1E202C;
}

.biz-table th.text-center,
.biz-table td.text-center,
.text-center {
  text-align: center !important;
}

.biz-table th.text-left,
.biz-table td.text-left,
.text-left {
  text-align: left !important;
}

.biz-table th.text-right,
.biz-table td.text-right,
.text-right {
  text-align: right !important;
}

/* ORDER REPORT CARD BOXES */
.order-status-boxes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 6px;
}

.status-box {
  padding: 12px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid #EAECEF;
}

.box-blue { background: #F4F8FF; border-color: #D0E2FF; }
.box-green { background: #F0FDF4; border-color: #BBF7D0; }
.box-gold { background: #FEFCE8; border-color: #FEF08A; }
.box-gray { background: #F8FAFC; border-color: #E2E8F0; }

.box-label {
  font-size: 11px;
  font-weight: 700;
  color: #5F6173;
}

.box-num {
  font-size: 20px;
  font-weight: 800;
  color: #1E202C;
  line-height: 1.2;
}

.box-sub {
  font-size: 10.5px;
  font-weight: 700;
}

.status-legend-footer {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11.5px;
  color: #5F6173;
  font-weight: 600;
}

.legend-dots-row {
  display: flex;
  gap: 14px;
}

/* FOOTER PILL CARDS */
.bottom-pills-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 4px;
}

.pill-card {
  background: #FFFFFF;
  border-radius: 14px;
  padding: 12px 18px;
  border: 1px solid #EAECEF;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.pill-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pill-label {
  font-size: 11.5px;
  font-weight: 800;
  color: #5F6173;
  letter-spacing: 0.02em;
}

.pill-val {
  font-size: 16px;
  font-weight: 800;
  color: #1E202C;
  margin-left: auto;
}

@media (max-width: 1400px) {
  .top-kpis-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1100px) {
  .middle-cards-grid,
  .bottom-tables-grid,
  .top-kpis-grid {
    grid-template-columns: 1fr;
  }
  .bottom-pills-row {
    grid-template-columns: 1fr;
  }
}
</style>
