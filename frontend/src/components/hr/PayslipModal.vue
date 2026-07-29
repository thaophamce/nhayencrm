<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  PayslipModal.vue — phiếu lương chi tiết + in (window.print).
  Nhận record (payload payroll) + tên nhân viên + period. Chỉ hiển thị, không sửa.
-->
<template>
  <v-dialog v-model="open" max-width="620" scrollable>
    <v-card v-if="record" class="payslip-card">
      <v-card-title class="d-flex align-center payslip-dialog-title">
        <v-icon icon="mdi-file-document-outline" class="mr-2" color="primary" />
        <span>Phiếu lương</span>
        <v-spacer />
        <v-chip v-if="record.isManualOverride" size="small" color="info" variant="tonal">
          Nhập tay
        </v-chip>
      </v-card-title>

      <v-card-text class="payslip-scroll">
        <div id="payslip-print" class="payslip-sheet">
          <!-- Đầu phiếu -->
          <header class="ps-header">
            <div class="ps-brand">
              <div class="ps-org">Nhà Yến</div>
              <div class="ps-doc">PHIẾU LƯƠNG</div>
            </div>
            <div class="ps-period">
              <div class="ps-period-label">Kỳ lương</div>
              <div class="ps-period-value">{{ formatMonthLabel(period) }}</div>
            </div>
          </header>

          <div class="ps-employee">
            <div class="ps-avatar">{{ initials }}</div>
            <div class="ps-employee-info">
              <div class="ps-name">{{ name }}</div>
              <div class="ps-meta">
                Ngày công: <strong>{{ record.workDays }}</strong> / {{ record.workingDays || 26 }} ngày
              </div>
            </div>
          </div>

          <!-- Thu nhập -->
          <section class="ps-section">
            <div class="ps-section-title ps-section-title--income">Thu nhập</div>
            <table class="ps-table">
              <tbody>
                <tr>
                  <td>Lương cơ bản</td>
                  <td class="num">{{ formatVnd(record.baseSalary) }}</td>
                </tr>
                <tr>
                  <td>Thành tiền theo công <span class="ps-hint">({{ record.workDays }}/{{ record.workingDays || 26 }})</span></td>
                  <td class="num">{{ formatVnd(record.thanhTien) }}</td>
                </tr>
                <tr>
                  <td>Tăng ca <span class="ps-hint">({{ record.overtimeHours }}h thường · {{ record.overtimeSundayHours }}h CN)</span></td>
                  <td class="num">{{ formatVnd(record.overtimeAmount) }}</td>
                </tr>
                <tr><td>KPI</td><td class="num">{{ formatVnd(record.kpiAmount) }}</td></tr>
                <tr><td>Phụ cấp</td><td class="num">{{ formatVnd(record.allowanceAmount) }}</td></tr>
                <tr class="ps-subtotal">
                  <td>Tổng thu nhập</td>
                  <td class="num">{{ formatVnd(record.totalSalary) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Khấu trừ -->
          <section class="ps-section">
            <div class="ps-section-title ps-section-title--deduct">Khấu trừ</div>
            <table class="ps-table">
              <tbody>
                <tr><td>Tạm ứng</td><td class="num minus">− {{ formatVnd(record.advanceAmount) }}</td></tr>
                <tr><td>Fill đơn</td><td class="num minus">− {{ formatVnd(record.fillOrderAmount) }}</td></tr>
                <tr>
                  <td>Bảo hiểm <span v-if="!record.hasInsurance" class="ps-hint">(không tham gia)</span></td>
                  <td class="num minus">− {{ formatVnd(record.insuranceAmount) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Thực nhận -->
          <div class="ps-net">
            <div class="ps-net-label">Thực nhận</div>
            <div class="ps-net-value">{{ formatVnd(record.netSalary) }}</div>
          </div>

          <footer class="ps-footer">
            Phiếu lương được tạo tự động từ hệ thống — vui lòng liên hệ quản lý nếu có sai sót.
          </footer>
        </div>
      </v-card-text>

      <v-card-actions class="payslip-actions">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Đóng</v-btn>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-printer" @click="printSlip">In phiếu</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatVnd, formatMonthLabel } from '@/constants/hr';

const props = defineProps<{
  modelValue: boolean;
  record: any | null;
  name: string;
  period: string;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const initials = computed(() => {
  if (!props.name) return '?';
  const words = props.name.trim().split(/\s+/);
  if (words.length === 1) return words[0][0]?.toUpperCase() || '?';
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
});

function printSlip() {
  window.print();
}
</script>

<style scoped>
.payslip-card {
  border-radius: 12px;
}
.payslip-dialog-title {
  border-bottom: 1px solid #eaecef;
  padding: 16px 20px;
}
.payslip-scroll {
  padding: 0;
  max-height: 70vh;
}
.payslip-actions {
  border-top: 1px solid #eaecef;
  padding: 12px 20px;
}

.payslip-sheet {
  max-width: 560px;
  margin: 0 auto;
  padding: 28px 24px;
  background: #ffffff;
}

.ps-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 2px solid #2f80ed;
}
.ps-brand {
  flex: 1;
}
.ps-org {
  font-size: 18px;
  font-weight: 700;
  color: #1e202c;
  margin-bottom: 2px;
}
.ps-doc {
  font-size: 13px;
  font-weight: 600;
  color: #2f80ed;
  letter-spacing: 0.5px;
}
.ps-period {
  text-align: right;
}
.ps-period-label {
  font-size: 11px;
  color: #8a8d9c;
  margin-bottom: 2px;
}
.ps-period-value {
  font-size: 15px;
  font-weight: 700;
  color: #1e202c;
}

.ps-employee {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: #f7f8fc;
  border-radius: 10px;
  margin-bottom: 24px;
}
.ps-avatar {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2f80ed 0%, #1a6fd4 100%);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
}
.ps-employee-info {
  flex: 1;
}
.ps-name {
  font-size: 16px;
  font-weight: 700;
  color: #1e202c;
  margin-bottom: 2px;
}
.ps-meta {
  font-size: 12.5px;
  color: #5f6173;
}

.ps-section {
  margin-bottom: 20px;
}
.ps-section-title {
  font-size: 13px;
  font-weight: 700;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
}
.ps-section-title--income {
  background: #ebf3ff;
  color: #2f80ed;
}
.ps-section-title--deduct {
  background: #fff1f0;
  color: #d32f2f;
}

.ps-table {
  width: 100%;
  border-collapse: collapse;
}
.ps-table td {
  padding: 9px 8px;
  border-bottom: 1px solid #f0f2f5;
  font-size: 13.5px;
  color: #1e202c;
}
.ps-table td.num {
  text-align: right;
  white-space: nowrap;
  font-weight: 600;
}
.ps-table td.minus {
  color: #d32f2f;
}
.ps-table tr.ps-subtotal td {
  font-weight: 700;
  font-size: 14px;
  padding-top: 12px;
  border-top: 1px solid #cbd5e1;
  color: #2f80ed;
}
.ps-hint {
  font-size: 11.5px;
  color: #8a8d9c;
  font-weight: 400;
}

.ps-net {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  background: linear-gradient(135deg, #2f80ed 0%, #1a6fd4 100%);
  border-radius: 10px;
  margin: 24px 0 20px;
}
.ps-net-label {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}
.ps-net-value {
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
}

.ps-footer {
  font-size: 11px;
  color: #8a8d9c;
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid #eef2f7;
  line-height: 1.5;
}

@media print {
  :deep(.v-overlay__scrim),
  :deep(.v-card-actions),
  :deep(.v-card-title),
  .payslip-actions,
  .payslip-dialog-title {
    display: none !important;
  }
  .payslip-sheet {
    padding: 20px;
    max-width: 100%;
  }
  .ps-header {
    border-bottom-width: 1.5px;
  }
  .ps-net {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
</style>
