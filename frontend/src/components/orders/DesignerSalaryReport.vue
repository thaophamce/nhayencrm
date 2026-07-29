<template>
  <div class="designer-salary-report pa-4 bg-white rounded-xl shadow-sm border mt-3">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between flex-wrap gap-3 mb-4">
      <div>
        <h3 class="text-subtitle-1 font-weight-bold" style="color: #2F80ED;">📊 Bảng xếp hạng lương</h3>
        <p class="text-caption text-grey-darken-1 mb-0">Tính theo công thức lương thiệp cưới (20.000đ/file + 10.000đ/đơn chốt in)</p>
      </div>

      <!-- Chọn tháng -->
      <div style="width: 180px;">
        <v-text-field
          v-model="selectedMonth"
          type="month"
          label="Chọn tháng báo cáo"
          variant="outlined"
          density="compact"
          hide-details
          color="#2F80ED"
          @change="loadReport"
        />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="d-flex justify-center align-center py-10">
      <v-progress-circular indeterminate color="#2F80ED" />
      <span class="ml-3 text-body-2 text-grey-darken-1">Đang tính toán lương...</span>
    </div>

    <!-- Data Table -->
    <template v-else>
      <v-table class="salary-table text-left" density="comfortable">
        <thead>
          <tr class="bg-grey-lighten-4">
            <th class="font-weight-bold text-center" style="width: 40px;">#</th>
            <th class="font-weight-bold">Họ tên</th>
            <th class="font-weight-bold text-center">Số đơn</th>
            <th class="font-weight-bold text-center">Số file</th>
            <th class="font-weight-bold text-center">Đơn chốt in</th>
            <th class="font-weight-bold text-center">Lương file</th>
            <th class="font-weight-bold text-center">Thưởng</th>
            <th class="font-weight-bold text-center">Phí thiết kế</th>
            <th class="font-weight-bold text-right" style="color: #2F80ED;">Tổng lương</th>
            <th class="font-weight-bold text-center">Phiếu lương</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in reportData" :key="row.designerId" :class="{ 'current-user-row': row.designerId === currentUser?.id }">
            <td class="text-center">
              <span v-if="idx === 0" title="Hạng 1">🥇</span>
              <span v-else-if="idx === 1" title="Hạng 2">🥈</span>
              <span v-else-if="idx === 2" title="Hạng 3">🥉</span>
              <span v-else class="text-grey-darken-1">{{ idx + 1 }}</span>
            </td>
            <td class="font-weight-medium">
              {{ row.designerName }}
              <v-chip v-if="row.designerId === currentUser?.id" size="x-small" color="#2F80ED" class="text-white ml-2">Tôi</v-chip>
            </td>
            <td class="text-center">{{ row.orderCount }}</td>
            <td class="text-center">{{ row.totalFiles }}</td>
            <td class="text-center">{{ row.approvedCount }}</td>
            <td class="text-center font-weight-medium">{{ formatPrice(row.fileSalary) }}</td>
            <td class="text-center font-weight-medium">{{ formatPrice(row.bonusSalary) }}</td>
            <td class="text-center font-weight-medium">{{ formatPrice(row.designFeeSalary) }}</td>
            <td class="text-right font-weight-bold" style="color: #2F80ED; font-size: 15px;">
              {{ formatPrice(row.totalSalary) }}
            </td>
            <td class="text-center">
              <v-btn size="x-small" color="#6366F1" class="text-white text-capitalize" prepend-icon="mdi-file-document-outline" @click="viewPayslip(row)">
                Xem
              </v-btn>
            </td>
          </tr>
          <tr v-if="!reportData.length">
            <td colspan="10" class="text-center py-6 text-grey-darken-1 text-body-2">
              Không có dữ liệu thiết kế nào trong tháng này.
            </td>
          </tr>
        </tbody>
        <tfoot v-if="reportData.length">
          <tr class="total-row">
            <td></td>
            <td class="font-weight-bold">TỔNG</td>
            <td class="text-center font-weight-bold">{{ totals.orderCount }}</td>
            <td class="text-center font-weight-bold">{{ totals.totalFiles }}</td>
            <td class="text-center font-weight-bold">{{ totals.approvedCount }}</td>
            <td class="text-center font-weight-bold">{{ formatPrice(totals.fileSalary) }}</td>
            <td class="text-center font-weight-bold">{{ formatPrice(totals.bonusSalary) }}</td>
            <td class="text-center font-weight-bold">{{ formatPrice(totals.designFeeSalary) }}</td>
            <td class="text-right font-weight-bold" style="color: #2F80ED; font-size: 15px;">
              {{ formatPrice(totals.totalSalary) }}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </v-table>
    </template>

    <!-- Modal Phiếu lương -->
    <v-dialog v-model="showPayslip" max-width="420">
      <v-card v-if="payslipRow" class="rounded-xl pa-2">
        <v-card-title class="d-flex align-center justify-space-between px-4 pt-3">
          <span class="text-subtitle-1 font-weight-bold" style="color: #2F80ED;">🧾 Phiếu lương</span>
          <v-btn icon size="small" variant="text" @click="showPayslip = false">
            <v-icon size="20">mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text class="px-4 pb-4">
          <div class="text-caption text-grey-darken-1 mb-2">Tháng {{ formatMonthLabel(selectedMonth) }}</div>
          <div class="payslip-name mb-3">
            <div class="text-caption text-grey-darken-1">Họ tên</div>
            <div class="text-subtitle-1 font-weight-bold">{{ payslipRow.designerName }}</div>
          </div>

          <div class="d-flex justify-space-between text-body-2 py-1">
            <span class="text-grey-darken-1">Số đơn</span>
            <b>{{ payslipRow.orderCount }}</b>
          </div>
          <div class="d-flex justify-space-between text-body-2 py-1">
            <span class="text-grey-darken-1">Số file nhận ({{ payslipRow.totalFiles }} × 20.000đ)</span>
            <b>{{ formatPrice(payslipRow.fileSalary) }}</b>
          </div>
          <div class="d-flex justify-space-between text-body-2 py-1">
            <span class="text-grey-darken-1">Đơn chốt in ({{ payslipRow.approvedCount }} × 10.000đ)</span>
            <b>{{ formatPrice(payslipRow.bonusSalary) }}</b>
          </div>
          <div class="d-flex justify-space-between text-body-2 py-1">
            <span class="text-grey-darken-1">Phí thiết kế</span>
            <b>{{ formatPrice(payslipRow.designFeeSalary) }}</b>
          </div>
          <v-divider class="my-2" />
          <div class="d-flex justify-space-between text-subtitle-1">
            <span class="font-weight-bold">Tổng lương</span>
            <b style="color: #2F80ED;">{{ formatPrice(payslipRow.totalSalary) }}</b>
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-3">
          <v-spacer />
          <v-btn color="#2F80ED" variant="flat" class="text-white text-capitalize" prepend-icon="mdi-printer" @click="printPayslip">
            In phiếu lương
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api/index';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const currentUser = computed(() => authStore.user);

const selectedMonth = ref(new Date().toISOString().slice(0, 7));
const loading = ref(false);
const reportData = ref<any[]>([]);

const showPayslip = ref(false);
const payslipRow = ref<any>(null);

const totals = computed(() => {
  return reportData.value.reduce((acc, r) => {
    acc.orderCount += r.orderCount || 0;
    acc.totalFiles += r.totalFiles || 0;
    acc.approvedCount += r.approvedCount || 0;
    acc.fileSalary += r.fileSalary || 0;
    acc.bonusSalary += r.bonusSalary || 0;
    acc.designFeeSalary += r.designFeeSalary || 0;
    acc.totalSalary += r.totalSalary || 0;
    return acc;
  }, { orderCount: 0, totalFiles: 0, approvedCount: 0, fileSalary: 0, bonusSalary: 0, designFeeSalary: 0, totalSalary: 0 });
});

onMounted(() => {
  loadReport();
});

watch(selectedMonth, () => {
  loadReport();
});

async function loadReport() {
  loading.value = true;
  try {
    const res = await api.get<{ month: string; report: any[] }>('/orders/reports', {
      params: { month: selectedMonth.value }
    });

    // Nếu không phải Admin/Manager, chỉ hiển thị báo cáo của chính Designer đang đăng nhập
    const isAdminOrManager = currentUser.value?.role === 'owner' || currentUser.value?.role === 'admin' || authStore.canAccess('user');
    if (!isAdminOrManager && res.data.report) {
      reportData.value = res.data.report.filter(r => r.designerId === currentUser.value?.id);
    } else {
      reportData.value = res.data.report || [];
    }
  } catch (err) {
    console.error('Cannot load salary report:', err);
  } finally {
    loading.value = false;
  }
}

function viewPayslip(row: any) {
  payslipRow.value = row;
  showPayslip.value = true;
}

function printPayslip() {
  window.print();
}

function formatPrice(value: number) {
  if (value === undefined || value === null) return '0đ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value).replace('₫', 'đ');
}

function formatMonthLabel(monthStr: string) {
  const [y, m] = monthStr.split('-');
  return `${m}/${y}`;
}
</script>

<style scoped>
.current-user-row {
  background-color: #EBF3FF !important;
}
.total-row td {
  background-color: #EBF3FF !important;
  border-top: 2px solid #2F80ED !important;
  font-size: 14px !important;
}
.salary-table th {
  font-size: 13px !important;
}
.salary-table td {
  font-size: 13.5px !important;
}
.payslip-name {
  background: #F8FAFC;
  border-radius: 10px;
  padding: 12px 14px;
}
</style>
