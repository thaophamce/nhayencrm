<template>
  <div class="finance-page">
    <div class="finance-layout">
      <aside class="finance-sidebar">
        <nav aria-label="Điều hướng tài chính">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            :class="{ active: activeTab === tab.value }"
            @click="activeTab = tab.value"
          >
            <v-icon :icon="tab.icon" size="19" />
            <span>{{ tab.label }}</span>
          </button>
        </nav>
      </aside>

      <div class="finance-workspace" :class="{ 'overview-workspace': activeTab === 'overview' }">
        <header class="finance-header" :class="{ 'overview-header': activeTab === 'overview' }">
          <div>
            <p class="eyebrow">TRUNG TÂM TÀI CHÍNH</p>
            <h1>{{ activeTitle }}</h1>
            <p class="subtitle">Theo dõi công nợ, dòng tiền và các quỹ nội bộ Nhà Yến</p>
          </div>
          <div class="header-actions">
            <div class="sync-pill"><v-icon size="15">mdi-cloud-check-outline</v-icon>Dữ liệu nội bộ</div>
            <button class="primary-action" type="button" @click="openTransaction">
              <v-icon size="17">mdi-plus</v-icon>Thêm giao dịch
            </button>
          </div>
        </header>

        <main :class="{
          'overview-main': activeTab === 'overview',
          'finance-subpage': activeTab !== 'overview',
          'fund-subpage': activeTab === 'reserve' || activeTab === 'profit',
          'profit-subpage': activeTab === 'profit',
          'debts-subpage': activeTab === 'debts',
          'cashflow-subpage': activeTab === 'cashflow',
          'wallet-subpage': activeTab === 'wallet'
        }">
          <template v-if="activeTab === 'overview'">
            <section class="overview-funds" aria-labelledby="cash-funds-heading">
              <p id="cash-funds-heading" class="section-label">QUẢN LÝ TIỀN MẶT &amp; QUỸ</p>
              <div class="funds-grid">
                <article class="metric-block">
                  <div class="block-heading"><span>TỔNG TIỀN NGÂN HÀNG</span><v-icon size="20">mdi-wallet-outline</v-icon></div>
                  <strong>{{ money(finance.bankBalance) }}</strong>
                  <small>Bằng tổng tiền các quỹ bên dưới</small>
                </article>
                <article class="metric-block">
                  <div class="block-heading">
                    <span>QUỸ DỰ PHÒNG TÀI CHÍNH</span>
                    <div class="block-actions">
                      <button type="button" @click="activeTab = 'reserve'">Lịch sử</button>
                      <button class="add" type="button" @click="openTypedTransaction('Tích lũy Dự phòng')">+ Nhập thêm</button>
                      <button class="spend" type="button" @click="openTypedTransaction('Chi từ Dự phòng')">Chi</button>
                    </div>
                  </div>
                  <strong>{{ money(finance.reserveBalance) }}</strong>
                  <small class="blue-copy">Chỉ dùng khi cần gấp</small>
                </article>
                <article class="metric-block">
                  <div class="block-heading">
                    <span>QUỸ RÚT LỢI NHUẬN</span>
                    <div class="block-actions">
                      <button type="button" @click="activeTab = 'profit'">Lịch sử</button>
                      <button class="add" type="button" @click="openTypedTransaction('Tích lũy Lợi nhuận')">+ Nhập thêm</button>
                      <button class="withdraw" type="button" @click="openTypedTransaction('Rút lợi nhuận')">Rút</button>
                    </div>
                  </div>
                  <strong>{{ money(finance.profitBalance) }}</strong>
                  <small class="green-copy">CEO có thể rút</small>
                </article>
              </div>
            </section>

            <section class="overview-debts" aria-labelledby="supplier-debt-heading">
              <p id="supplier-debt-heading" class="section-label">CHI TIẾT CÔNG NỢ NHÀ CUNG CẤP</p>
              <div class="debt-blocks-grid">
                <article v-for="supplier in finance.suppliers" :key="supplier.id" class="metric-block">
                  <div class="block-heading">
                    <span>CÔNG NỢ {{ supplier.name.replace('Xưởng ', '').toUpperCase() }}</span>
                    <div class="block-actions">
                      <button type="button" @click="activeTab = 'debts'">Lịch sử</button>
                      <button class="supplier-add" type="button" @click="openSupplierCost(supplier.id)">+ Nhập thêm</button>
                    </div>
                  </div>
                  <strong>{{ money(supplier.debt) }}</strong>
                  <small>Chu kỳ: {{ supplier.cycle }} ngày</small>
                </article>
                <article class="metric-block total-debt-block">
                  <div class="block-heading"><span>TỔNG CÔNG NỢ</span><v-icon size="20">mdi-medal-outline</v-icon></div>
                  <strong>{{ money(totalDebt) }}</strong>
                  <small>Sạch nợ ngày 26/12/2026</small>
                </article>
              </div>
            </section>

            <section class="panel repayment-panel">
              <div class="repayment-heading">
                <div><h2>Tiến độ trả nợ tổng thể</h2><p>So với nợ gốc ban đầu {{ money(initialDebt) }}</p></div>
                <div><button type="button" class="repay-debt-button" @click="openOverallRepayment">Trả nợ</button><strong>{{ debtProgress }}%</strong></div>
              </div>
              <svg
                class="debt-progress-svg"
                viewBox="0 0 1000 16"
                preserveAspectRatio="none"
                role="progressbar"
                aria-label="Tiến độ trả nợ"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="debtProgress"
              >
                <rect
                  class="debt-progress-background"
                  x="0.5"
                  y="0.5"
                  width="999"
                  height="15"
                  rx="7.5"
                  fill="#dfeae7"
                  stroke="#9fc9be"
                />
                <rect
                  class="debt-progress-value"
                  x="1"
                  y="1"
                  :width="Math.max(0, debtProgress * 9.98)"
                  height="14"
                  rx="7"
                  fill="#087b65"
                />
              </svg>
              <div class="repayment-stats">
                <div><span>Tổng nợ</span><strong>{{ money(totalDebt) }}</strong></div>
                <div><span>Đã xử lý (giảm nợ)</span><strong class="green-copy">{{ money(initialDebt - totalDebt) }}</strong></div>
                <div><span>Nợ gốc ban đầu</span><strong class="amber-copy">{{ money(initialDebt) }}</strong></div>
              </div>
            </section>

            <section class="overview-history">
              <div class="history-heading">
                <div><h2>Lịch sử gần đây</h2><p>Lọc theo tháng — không ảnh hưởng số dư quỹ hay tổng công nợ</p></div>
                <label class="month-filter"><span>Tháng:</span><input v-model="dashboardMonthFilter" type="month" /></label>
              </div>
              <div class="history-grid">
                <article class="panel history-panel">
                  <div class="panel-title"><div><h2>Lịch sử trả nợ gần đây</h2><p>Danh sách các giao dịch thanh toán công nợ nhà cung cấp</p></div></div>
                  <TransactionTable :items="paymentTransactions" :money="money" :suppliers="finance.suppliers" supplier-mode />
                </article>
                <article class="panel history-panel">
                  <div class="panel-title"><div><h2>Lịch sử phát sinh nợ gần đây</h2><p>Danh sách chi phí và giao dịch chi mới nhất</p></div></div>
                  <TransactionTable :items="costTransactions" :money="money" :suppliers="finance.suppliers" supplier-mode hide-note />
                </article>
              </div>
            </section>
      </template>

      <template v-else-if="activeTab === 'debts'">
        <section class="panel">
          <div class="panel-title"><div><p class="eyebrow">CÔNG NỢ NCC</p><h2>Chi tiết theo nhà cung cấp</h2></div></div>
          <div class="debt-list">
            <article v-for="supplier in finance.suppliers" :key="supplier.id">
              <div class="supplier-avatar">{{ supplier.short }}</div>
              <div><h3>{{ supplier.name }}</h3><p>Chu kỳ thanh toán {{ supplier.cycle }} ngày</p></div>
              <div><span>Dư nợ</span><strong>{{ money(supplier.debt) }}</strong></div>
              <div><span>Chi phí tháng này</span><strong>{{ money(supplier.monthCost) }}</strong></div>
              <button type="button" @click="prepareSupplierPayment(supplier.id)">Ghi nhận thanh toán</button>
            </article>
          </div>
        </section>
      </template>

      <template v-else-if="activeTab === 'reserve' || activeTab === 'profit'">
        <section class="fund-hero" :class="activeTab">
          <div class="fund-symbol"><v-icon size="34">{{ activeTab === 'reserve' ? 'mdi-shield-check-outline' : 'mdi-chart-line' }}</v-icon></div>
          <div><p>{{ activeTab === 'reserve' ? 'QUỸ DỰ PHÒNG' : 'QUỸ LỢI NHUẬN' }}</p><strong>{{ money(activeTab === 'reserve' ? finance.reserveBalance : finance.profitBalance) }}</strong><span>Số dư khả dụng hiện tại</span></div>
        </section>
        <section class="panel">
          <div class="panel-title"><div><p class="eyebrow">LỊCH SỬ QUỸ</p><h2>Biến động gần đây</h2></div></div>
          <TransactionTable :items="fundTransactions" :money="money" fund-mode />
        </section>
      </template>

      <template v-else-if="activeTab === 'wallet'">
        <section class="fund-hero wallet-hero">
          <div class="fund-symbol"><v-icon size="34">mdi-wallet-outline</v-icon></div>
          <div>
            <p>VÍ CÁ NHÂN</p>
            <strong>{{ money(walletTotal) }}</strong>
            <span>{{ walletMonthFilter ? 'Tháng ' + walletMonthFilter.slice(5,7) + '/' + walletMonthFilter.slice(0,4) : 'Tổng tất cả thời gian' }}</span>
          </div>
          <div class="wallet-filter-area">
            <label class="month-filter wallet-month-filter"><span>Lọc tháng:</span><input v-model="walletMonthFilter" type="month" /></label>
            <button v-if="walletMonthFilter" type="button" class="wallet-clear-btn" @click="walletMonthFilter = ''">Tất cả</button>
          </div>
        </section>
        <section class="panel">
          <div class="panel-title"><div><p class="eyebrow">VÍ CÁ NHÂN</p><h2>Lịch sử rút lợi nhuận</h2></div></div>
          <TransactionTable :items="walletTransactions" :money="money" fund-mode />
        </section>
      </template>

      <template v-else>
        <section class="panel">
          <div class="panel-title">
            <div><p class="eyebrow">SỔ GIAO DỊCH</p><h2>Toàn bộ dòng tiền</h2></div>
            <button class="primary-action" type="button" @click="openTransaction"><v-icon size="17">mdi-plus</v-icon>Thêm giao dịch</button>
          </div>
          <TransactionTable :items="cashflowTransactions" :money="money" />
        </section>
      </template>
    </main>
      </div>
    </div>

    <button
      class="quick-allocation-button"
      type="button"
      title="Phân bổ tiền nhanh"
      aria-label="Mở công cụ phân bổ tiền nhanh"
      @click="openQuickAllocation"
    >
      <v-icon size="20">mdi-chart-bar</v-icon>
      <span>Phân bổ nhanh</span>
    </button>

    <v-dialog v-model="allocationDialog" max-width="520">
      <v-card class="allocation-dialog">
        <div class="allocation-dialog-header">
          <div>
            <p class="eyebrow">CÔNG CỤ DÒNG TIỀN</p>
            <h2>Phân bổ tiền nhanh</h2>
          </div>
          <button type="button" aria-label="Đóng công cụ phân bổ" @click="allocationDialog = false">
            <v-icon size="20">mdi-close</v-icon>
          </button>
        </div>

        <v-card-text>
          <p class="allocation-description">
            Mô phỏng cách chia dòng tiền mới về theo tỷ lệ tài chính hiện tại. Kết quả này không làm thay đổi số dư.
          </p>

          <label class="allocation-amount-field">
            <span>Số tiền mới về</span>
            <div>
              <input
                :value="allocationAmount"
                inputmode="numeric"
                autocomplete="off"
                placeholder="Ví dụ: 100.000.000"
                @input="updateAllocationAmount"
              />
              <strong>₫</strong>
            </div>
          </label>

          <div v-if="allocationSuggestion" class="allocation-results" aria-live="polite">
            <article class="debt">
              <div><span>01</span><p>Trả nợ nhà cung cấp<small>75% dòng tiền</small></p></div>
              <strong>{{ money(allocationSuggestion.debt) }}</strong>
            </article>
            <article class="reserve">
              <div><span>02</span><p>Quỹ dự phòng<small>15% dòng tiền</small></p></div>
              <strong>{{ money(allocationSuggestion.reserve) }}</strong>
            </article>
            <article class="profit">
              <div><span>03</span><p>Quỹ lợi nhuận<small>10% dòng tiền</small></p></div>
              <strong>{{ money(allocationSuggestion.profit) }}</strong>
            </article>
          </div>

          <div v-else class="allocation-empty">
            <v-icon size="28">mdi-calculator-variant-outline</v-icon>
            <span>Nhập số tiền để xem phương án phân bổ</span>
          </div>

          <p class="allocation-ratio-note">
            Tỷ lệ mặc định: Trả nợ 75% · Dự phòng 15% · Lợi nhuận 10%
          </p>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialog" max-width="520">
      <v-card class="transaction-dialog">
        <v-card-title>Thêm giao dịch tài chính</v-card-title>
        <v-card-text>
          <div class="form-grid">
            <label>Ngày<input v-model="form.date" type="date" /></label>
            <label>Loại giao dịch
              <select v-model="form.type">
                <option>COD Viettel</option><option>Cọc khách</option><option>Thanh toán khách</option>
                <option>Thanh toán NCC</option><option>Tích lũy Dự phòng</option><option>Tích lũy Lợi nhuận</option>
                <option>Chi từ Dự phòng</option><option>Rút lợi nhuận</option><option>Phát sinh công nợ</option>
              </select>
            </label>
            <label v-if="form.type === 'Thanh toán NCC' || form.type === 'Phát sinh công nợ'">Nhà cung cấp
              <select v-model="form.supplierId"><option v-for="s in finance.suppliers" :key="s.id" :value="s.id">{{ s.name }}</option></select>
            </label>
            <label>Số tiền<input v-model="form.amount" inputmode="numeric" placeholder="Ví dụ: 10.000.000" /></label>
            <label class="full">Ghi chú<textarea v-model="form.note" rows="3" placeholder="Mô tả giao dịch..." /></label>
          </div>
        </v-card-text>
        <v-card-actions>
          <button class="cancel-button" type="button" @click="dialog = false">Hủy</button>
          <button class="primary-action" type="button" @click="saveTransaction">Lưu giao dịch</button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from 'vue';
import { useToast } from '@/composables/use-toast';
import { createClientId } from '@/utils/client-id';

type Supplier = { id:string; short:string; name:string; debt:number; cycle:number; monthCost:number };
type Transaction = { id:string; date:string; type:string; amount:number; note:string; direction:'in'|'out'; supplierId?:string };
type FinanceState = { bankBalance:number; reserveBalance:number; profitBalance:number; suppliers:Supplier[]; transactions:Transaction[] };

const STORAGE_KEY = 'nhayen-finance-v2-cfo-20260729';
const LEGACY_STORAGE_KEYS = ['nhayen-finance-v1'];
const initialDebt = 459_973_590;
const defaults: FinanceState = {
  bankBalance: 173_800_000, reserveBalance: 81_800_000, profitBalance: 92_000_000,
  suppliers: [
    { id:'dn', short:'ĐN', name:'Xưởng Đà Nẵng', debt:299_154_690, cycle:7, monthCost:273_567_200 },
    { id:'hm', short:'HM', name:'Xưởng Hóc Môn', debt:18_766_000, cycle:15, monthCost:18_766_000 },
    { id:'tp', short:'TP', name:'Xưởng Tân Phú', debt:0, cycle:10, monthCost:39_014_000 },
  ],
  transactions: [
    { id:'cf-1785252099123', date:'2026-07-28', type:'Thanh toán NCC', amount:39_014_000, note:'Thanh toán công nợ Tân Phú', direction:'out', supplierId:'tp' },
    { id:'cf-1785252058807', date:'2026-07-28', type:'Tích luỹ Dự phòng', amount:13_500_000, note:'Tích lũy quỹ dự phòng tài chính', direction:'out' },
    { id:'cf-1785252051955', date:'2026-07-28', type:'Tích luỹ Lợi nhuận', amount:9_000_000, note:'Tích lũy quỹ rút lợi nhuận', direction:'out' },
    { id:'cf-1785052367698', date:'2026-07-26', type:'Thanh toán NCC', amount:50_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1785052359965', date:'2026-07-26', type:'Tích luỹ Lợi nhuận', amount:8_000_000, note:'Tích lũy quỹ rút lợi nhuận', direction:'out' },
    { id:'cf-1785052354383', date:'2026-07-26', type:'Tích luỹ Dự phòng', amount:3_300_000, note:'Tích lũy quỹ dự phòng tài chính', direction:'out' },
    { id:'cf-1784791401301', date:'2026-07-23', type:'Tích luỹ Dự phòng', amount:15_000_000, note:'Tích lũy quỹ dự phòng tài chính', direction:'out' },
    { id:'cf-1784791387849', date:'2026-07-21', type:'Tích luỹ Dự phòng', amount:10_000_000, note:'Tích lũy quỹ dự phòng tài chính', direction:'out' },
    { id:'cf-1784791377621', date:'2026-07-21', type:'Tích luỹ Lợi nhuận', amount:15_000_000, note:'Tích lũy quỹ rút lợi nhuận', direction:'out' },
    { id:'cf-1784791355453', date:'2026-07-21', type:'Thanh toán NCC', amount:50_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1784371720734', date:'2026-07-18', type:'Thanh toán NCC', amount:60_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1784038254246', date:'2026-07-14', type:'Thanh toán NCC', amount:50_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1784038241950', date:'2026-07-14', type:'Tích luỹ Dự phòng', amount:15_000_000, note:'Tích lũy quỹ dự phòng tài chính', direction:'out' },
    { id:'cf-1784038234208', date:'2026-07-14', type:'Tích luỹ Lợi nhuận', amount:20_000_000, note:'Tích lũy quỹ rút lợi nhuận', direction:'out' },
    { id:'cf-1783758892436', date:'2026-07-11', type:'Tích luỹ Dự phòng', amount:25_000_000, note:'Tích lũy quỹ dự phòng tài chính', direction:'out' },
    { id:'cf-1783758840867', date:'2026-07-11', type:'Tích luỹ Lợi nhuận', amount:40_000_000, note:'Tích lũy quỹ rút lợi nhuận', direction:'out' },
    { id:'cf-1783758834487', date:'2026-07-11', type:'Thanh toán NCC', amount:80_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1783501542441', date:'2026-07-08', type:'Rút lợi nhuận', amount:145_000_000, note:'Rút quỹ lợi nhuận', direction:'out' },
    { id:'cf-1783501428138', date:'2026-07-07', type:'Thanh toán NCC', amount:60_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1783397542914', date:'2026-07-04', type:'Thanh toán NCC', amount:19_387_000, note:'Thanh toán công nợ Hóc Môn', direction:'out', supplierId:'hm' },
    { id:'cf-1783152911566', date:'2026-07-04', type:'Thanh toán NCC', amount:60_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1782564757683', date:'2026-06-27', type:'Thanh toán NCC', amount:70_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1782205913979', date:'2026-06-23', type:'Thanh toán NCC', amount:60_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cf-1781947066077', date:'2026-06-20', type:'Thanh toán NCC', amount:80_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'plan-1781', date:'2026-06-15', type:'Thanh toán NCC', amount:90_000_000, note:'Thanh toán công nợ Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1784791483321', date:'2026-07-21', type:'Phát sinh công nợ', amount:28_213_700, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1784970151512', date:'2026-07-20', type:'Phát sinh công nợ', amount:18_766_000, note:'Giá vốn phát sinh · Xưởng Hóc Môn', direction:'out', supplierId:'hm' },
    { id:'cost-1784371712717', date:'2026-07-17', type:'Phát sinh công nợ', amount:112_774_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1783758953530', date:'2026-07-10', type:'Phát sinh công nợ', amount:60_622_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1783501526214', date:'2026-07-07', type:'Phát sinh công nợ', amount:14_497_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1783397045944', date:'2026-07-06', type:'Phát sinh công nợ', amount:35_952_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1783152892246', date:'2026-07-03', type:'Phát sinh công nợ', amount:15_343_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1783070770393', date:'2026-07-02', type:'Phát sinh công nợ', amount:6_165_500, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1784793766656', date:'2026-07-01', type:'Phát sinh công nợ', amount:39_014_000, note:'Giá vốn phát sinh · Xưởng Tân Phú', direction:'out', supplierId:'tp' },
    { id:'cost-1782804733691', date:'2026-06-29', type:'Phát sinh công nợ', amount:42_826_900, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1782703769118', date:'2026-06-26', type:'Phát sinh công nợ', amount:23_086_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1782398353232', date:'2026-06-25', type:'Phát sinh công nợ', amount:26_130_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1782398285591', date:'2026-06-24', type:'Phát sinh công nợ', amount:23_161_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1782398170146', date:'2026-06-23', type:'Phát sinh công nợ', amount:25_708_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1782202442938', date:'2026-06-22', type:'Phát sinh công nợ', amount:20_414_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1781947319789', date:'2026-06-20', type:'Phát sinh công nợ', amount:28_412_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1782005552265', date:'2026-06-20', type:'Phát sinh công nợ', amount:25_491_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1781947086604', date:'2026-06-19', type:'Phát sinh công nợ', amount:12_718_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-1', date:'2026-06-18', type:'Phát sinh công nợ', amount:17_690_000, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-2', date:'2026-06-17', type:'Phát sinh công nợ', amount:399_950_590, note:'Giá vốn phát sinh · Xưởng Đà Nẵng', direction:'out', supplierId:'dn' },
    { id:'cost-3', date:'2026-06-15', type:'Phát sinh công nợ', amount:90_000_000, note:'Số dư công nợ đầu kỳ chuyển đổi', direction:'out', supplierId:'dn' },
    { id:'cost-4', date:'2026-05-31', type:'Phát sinh công nợ', amount:19_387_000, note:'Giá vốn phát sinh · Xưởng Hóc Môn', direction:'out', supplierId:'hm' },
  ],
};
function loadState(): FinanceState {
  LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as FinanceState; } catch { return structuredClone(defaults); }
}
const finance = ref(loadState());
import { useRoute } from 'vue-router';

const route = useRoute();
const activeTab = ref((route.query.tab as string) || 'overview');

watch(
  () => route.query.tab,
  (newTab) => {
    if (newTab && typeof newTab === 'string') {
      activeTab.value = newTab;
    }
  },
);
const dialog = ref(false);
const allocationDialog = ref(false);
const allocationAmount = ref('');
const dashboardMonthFilter = ref('2026-07');
const walletMonthFilter = ref('');
const toast = useToast();
const tabs = [
  { value:'overview', label:'Tổng quan', icon:'mdi-view-dashboard-outline' },
  { value:'reserve', label:'Quỹ dự phòng', icon:'mdi-shield-check-outline' },
  { value:'profit', label:'Quỹ lợi nhuận', icon:'mdi-trending-up' },
  { value:'debts', label:'Công nợ', icon:'mdi-account-cash-outline' },
  { value:'cashflow', label:'Dòng tiền', icon:'mdi-swap-horizontal' },
  { value:'wallet', label:'Ví cá nhân', icon:'mdi-wallet-outline' },
];
const activeTitle = computed(() => tabs.find(t => t.value === activeTab.value)?.label || 'Tài chính');
const totalDebt = computed(() => finance.value.suppliers.reduce((sum, item) => sum + item.debt, 0));
const debtProgress = computed(() => {
  const percentage = (initialDebt - totalDebt.value) / initialDebt * 100;
  return Math.max(0, Math.min(100, Math.round(percentage * 10) / 10));
});
const sortedTransactions = computed(() => [...finance.value.transactions].sort((a,b) => b.date.localeCompare(a.date)));
const cashflowTransactions = computed(() => sortedTransactions.value.filter(t => t.type !== 'Phát sinh công nợ'));
const isInDashboardMonth = (item:Transaction) => !dashboardMonthFilter.value || item.date.startsWith(dashboardMonthFilter.value);
const paymentTransactions = computed(() => sortedTransactions.value.filter(t => t.type === 'Thanh toán NCC' && isInDashboardMonth(t)).slice(0,5));
const costTransactions = computed(() => {
  const items = sortedTransactions.value.filter(t => t.type === 'Phát sinh công nợ' && isInDashboardMonth(t));
  if (items.length) return items.slice(0,5);
  return finance.value.suppliers.map((supplier, index) => ({
    id:`cost-${supplier.id}`, date:`2026-07-${String(21-index*3).padStart(2,'0')}`,
    type:'Phát sinh xưởng', amount:supplier.monthCost, note:`Giá vốn phát sinh tháng 7 · ${supplier.name}`, direction:'out' as const, supplierId:supplier.id,
  }));
});
const fundTransactions = computed(() => sortedTransactions.value.filter(t => t.type.includes(activeTab.value === 'reserve' ? 'Dự phòng' : 'Lợi nhuận')));
const walletTransactions = computed(() => {
  const all = sortedTransactions.value.filter(t => t.type === 'Rút lợi nhuận');
  if (!walletMonthFilter.value) return all;
  return all.filter(t => t.date.startsWith(walletMonthFilter.value));
});
const walletTotal = computed(() => walletTransactions.value.reduce((sum, t) => sum + t.amount, 0));
const allocationNumericAmount = computed(() => Number(allocationAmount.value.replace(/[^\d]/g, '')) || 0);
const allocationSuggestion = computed(() => {
  const amount = allocationNumericAmount.value;
  if (!amount) return null;
  return {
    debt: amount * 0.75,
    reserve: amount * 0.15,
    profit: amount * 0.10,
  };
});
const form = ref({ date:new Date().toISOString().slice(0,10), type:'COD Viettel', amount:'', note:'', supplierId:'dn' });
const money = (value:number) => new Intl.NumberFormat('vi-VN', { style:'currency', currency:'VND', maximumFractionDigits:0 }).format(value);
function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(finance.value)); }
function openQuickAllocation(){
  allocationAmount.value = '';
  allocationDialog.value = true;
}
function updateAllocationAmount(event: Event){
  const target = event.target as HTMLInputElement;
  const digits = target.value.replace(/[^\d]/g, '');
  allocationAmount.value = digits ? new Intl.NumberFormat('vi-VN').format(Number(digits)) : '';
}
function openTransaction(){ form.value={ date:new Date().toISOString().slice(0,10),type:'COD Viettel',amount:'',note:'',supplierId:'dn' }; dialog.value=true; }
function openTypedTransaction(type:string){ openTransaction(); form.value.type=type; }
function openSupplierCost(id:string){ openTransaction(); form.value.type='Phát sinh công nợ'; form.value.supplierId=id; }
function prepareSupplierPayment(id:string){ openTransaction(); form.value.type='Thanh toán NCC'; form.value.supplierId=id; }
function openOverallRepayment(){
  const topDebtor = [...finance.value.suppliers].sort((a,b) => b.debt - a.debt)[0];
  openTransaction();
  form.value.type = 'Thanh toán NCC';
  form.value.supplierId = topDebtor?.id || finance.value.suppliers[0]?.id || 'dn';
}
function saveTransaction(){
  const amount=Number(form.value.amount.replace(/[^\d]/g,''));
  if(!amount){ toast.warning('Vui lòng nhập số tiền hợp lệ'); return; }
  const outgoing=['Thanh toán NCC','Tích lũy Dự phòng','Tích lũy Lợi nhuận','Chi từ Dự phòng','Rút lợi nhuận','Phát sinh công nợ'].includes(form.value.type);
  finance.value.transactions.push({id:createClientId(),date:form.value.date,type:form.value.type,amount,note:form.value.note||'Không có ghi chú',direction:outgoing?'out':'in',supplierId:form.value.supplierId});
  if(form.value.type==='Thanh toán NCC'){
    const supplier=finance.value.suppliers.find(s=>s.id===form.value.supplierId);
    if(supplier) supplier.debt=Math.max(0,supplier.debt-amount);
    finance.value.bankBalance=Math.max(0,finance.value.bankBalance-amount);
  } else if(form.value.type==='Phát sinh công nợ'){
    const supplier=finance.value.suppliers.find(s=>s.id===form.value.supplierId);
    if(supplier){ supplier.debt+=amount; supplier.monthCost+=amount; }
  } else if(form.value.type==='Tích lũy Dự phòng') finance.value.reserveBalance+=amount;
  else if(form.value.type==='Tích lũy Lợi nhuận') finance.value.profitBalance+=amount;
  else if(form.value.type==='Chi từ Dự phòng') finance.value.reserveBalance=Math.max(0,finance.value.reserveBalance-amount);
  else if(form.value.type==='Rút lợi nhuận') finance.value.profitBalance=Math.max(0,finance.value.profitBalance-amount);
  else finance.value.bankBalance+=amount;
  persist(); dialog.value=false; toast.success('Đã lưu giao dịch tài chính');
}

const TransactionTable = defineComponent({
  props:{
    items:{type:Array as ()=>Transaction[],required:true},
    money:{type:Function,required:true},
    suppliers:{type:Array as ()=>Supplier[],default:()=>[]},
    supplierMode:{type:Boolean,default:false},
    fundMode:{type:Boolean,default:false},
    hideNote:{type:Boolean,default:false},
  },
  setup(props){
    const supplierName=(item:Transaction)=>{
      const name=props.suppliers.find(s=>s.id===item.supplierId)?.name;
      return name ? name.replace(/^Xưởng\s+/i,'') : '—';
    };
    return()=>h('div',{class:'transaction-wrap'},[
    h('table',{class:'transaction-table'},[
      h('colgroup',{},props.hideNote ? [
        h('col',{style:{width:'25%'}}),
        h('col',{style:{width:'40%'}}),
        h('col',{style:{width:'35%'}}),
      ] : [
        h('col',{style:{width:'18%'}}),
        h('col',{style:{width:'25%'}}),
        h('col',{style:{width:'23%'}}),
        h('col',{style:{width:'34%'}}),
      ]),
      h('thead',{},h('tr',{},['Ngày',props.supplierMode?'Nhà cung cấp':'Nghiệp vụ','Số tiền','Ghi chú'].filter((_,index)=>!props.hideNote || index<3).map(x=>h('th',{},x)))),
      h('tbody',{},props.items.length?props.items.map(item=>{
        const fundExpense = item.type.startsWith('Chi ') || item.type.startsWith('Rút ');
        const displayDirection = props.fundMode ? (fundExpense ? 'out' : 'in') : item.direction;
        return h('tr',{key:item.id},[
          h('td',{},new Date(item.date+'T00:00:00').toLocaleDateString('vi-VN')),
          h('td',{},props.supplierMode
            ? h('strong',{class:['supplier-cell',displayDirection]},supplierName(item))
            : h('span',{class:['type-badge',displayDirection]},item.type)),
          h('td',{class:['amount-cell',displayDirection]},props.supplierMode
            ? props.money(item.amount)
            : `${displayDirection==='in'?'+':'−'}${props.money(item.amount)}`),
          ...(props.hideNote ? [] : [h('td',{class:'note-cell'},item.note)]),
        ]);
      }):h('tr',{},h('td',{colspan:props.hideNote ? 3 : 4,class:'empty-row'},'Chưa có giao dịch trong mục này')))
    ])
  ])}
});
</script>

<style scoped>
.finance-page{height:calc(100vh - 52px);min-height:0;background:#1a6fd4;color:#172033;overflow:hidden}.finance-layout{display:grid;grid-template-columns:220px minmax(0,1fr);height:100%;min-height:0}.finance-sidebar{display:flex;flex-direction:column;gap:5px;padding:8px 10px 14px;background:#1a6fd4;color:#fff;overflow-y:auto}.sidebar-title{display:flex;align-items:center;gap:9px;padding:8px 12px 14px;margin-bottom:5px;border-bottom:1px solid rgba(255,255,255,.18);font-size:16px;font-weight:800}.finance-sidebar nav{display:flex;flex-direction:column;gap:3px}.finance-sidebar button{display:flex;align-items:center;gap:10px;width:100%;padding:12px 13px;border:0;border-radius:8px;background:transparent;color:#fff;text-align:left;font:inherit;font-size:15px;font-weight:650;cursor:pointer}.finance-sidebar button:hover{background:rgba(255,255,255,.12)}.finance-sidebar button.active{background:rgba(255,255,255,.2);box-shadow:inset 3px 0 0 #fff;font-weight:800}.finance-workspace{min-width:0;min-height:0;padding:24px 28px 48px;border-top-left-radius:24px;background:#f4f7fb;overflow-y:auto}.finance-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 auto 18px;max-width:1540px}.eyebrow{margin:0 0 4px;color:#718096;font-size:11px;font-weight:800;letter-spacing:.12em}.finance-header h1{margin:0;font-size:27px;line-height:1.2}.subtitle{margin:5px 0 0;color:#718096;font-size:13px}.header-actions{display:flex;align-items:center;gap:10px}.sync-pill{display:flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid #d8e4ec;border-radius:9px;background:#fff;color:#39785d;font-size:12px;font-weight:700}.primary-action,.cancel-button,.text-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:9px;cursor:pointer;font:inherit;font-size:13px;font-weight:800}.primary-action{padding:10px 14px;background:#087b65;color:#fff}.primary-action:hover{background:#076b59}.cancel-button{padding:10px 16px;background:#edf2f7;color:#526174}.finance-page main{display:grid;gap:18px;max-width:1540px;margin:auto}.section-label{margin:0 0 9px;color:#637c99;font-size:11px;font-weight:900;letter-spacing:.08em}.funds-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.debt-blocks-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric-block{min-width:0;padding:18px;border:1px solid #dce5ed;border-radius:12px;background:#fff}.block-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:22px;color:#6f849c;font-size:10px;font-weight:900;letter-spacing:.04em}.block-heading button,.history-heading button{padding:5px 8px;border:1px solid #cdd9e4;border-radius:6px;background:#f8fafc;color:#52677d;font-size:10px;font-weight:800;cursor:pointer}.block-heading button:hover,.history-heading button:hover{border-color:#0a8b72;color:#087b65}.metric-block>strong{display:block;margin:16px 0 5px;color:#172033;font-size:21px;line-height:1.1}.metric-block>small{color:#758ba2;font-size:10px}.metric-block .blue-copy{color:#2878c8}.metric-block .green-copy,.green-copy{color:#078064!important}.total-debt-block{background:#f3fbf8;border-color:#bfe5d9}.total-debt-block .block-heading,.total-debt-block>strong{color:#078064}.repayment-panel{padding:20px}.repayment-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.repayment-heading h2,.history-heading h2{margin:0;color:#253247;font-size:16px}.repayment-heading p,.history-heading p,.history-panel .panel-title p{margin:3px 0 0;color:#7b8b9d;font-size:11px}.repayment-heading>div:last-child{display:flex;align-items:center;gap:12px}.repayment-heading>div:last-child .repay-debt-button{padding:6px 10px;border:0;border-radius:99px;background:#dff6ee;color:#087b65;font:inherit;font-size:10px;font-weight:900;cursor:pointer}.repayment-heading>div:last-child .repay-debt-button:hover{background:#c9ecdf}.repayment-heading>div:last-child .repay-debt-button:focus-visible{outline:2px solid #087b65;outline-offset:2px}.repayment-heading>div:last-child strong{color:#078064;font-size:20px}.repayment-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}.repayment-stats>div{padding:13px;border:1px solid #e1e8ef;border-radius:8px;background:#f8fafc;text-align:center}.repayment-stats span,.repayment-stats strong{display:block}.repayment-stats span{color:#7d8b9b;font-size:10px}.repayment-stats strong{margin-top:4px;font-size:13px}.amber-copy{color:#b77800!important}.history-heading{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:2px 0 10px}.history-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.history-panel{min-width:0}.history-panel .panel-title{margin-bottom:4px}.history-panel .panel-title h2{font-size:14px}.kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.kpi-card{display:flex;align-items:flex-start;gap:13px;min-width:0;padding:17px;border:1px solid #e0e7ef;border-radius:12px;background:#fff}.kpi-icon{display:grid;place-items:center;width:38px;height:38px;flex:0 0 auto;border-radius:10px}.kpi-card p{margin:0 0 7px;color:#718096;font-size:12px;font-weight:700}.kpi-card strong{display:block;overflow:hidden;color:#172033;font-size:19px;text-overflow:ellipsis;white-space:nowrap}.kpi-card span{display:block;margin-top:5px;color:#93a0af;font-size:11px}.kpi-card.debt .kpi-icon{background:#fff0f0;color:#dc4c4c}.kpi-card.bank .kpi-icon{background:#e9f3ff;color:#2773c8}.kpi-card.reserve .kpi-icon{background:#e8f7f2;color:#087b65}.kpi-card.profit .kpi-icon{background:#fff6dd;color:#b47b08}.overview-grid{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(280px,.75fr);gap:16px}.panel{padding:18px;border:1px solid #e0e7ef;border-radius:12px;background:#fff}.panel-title{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}.panel-title h2{margin:0;color:#263246;font-size:16px}.status-badge{padding:6px 9px;border-radius:999px;background:#e8f7f2;color:#087b65;font-size:11px;font-weight:800}.debt-summary{display:flex;align-items:center;gap:24px;padding:4px 8px}.progress-ring{display:grid;place-items:center;width:126px;height:126px;flex:0 0 auto;border-radius:50%;background:conic-gradient(#0a8b72 var(--progress),#e7edf3 0)}.progress-ring>div{display:flex;flex-direction:column;align-items:center;justify-content:center;width:94px;height:94px;border-radius:50%;background:#fff}.progress-ring strong{font-size:24px}.progress-ring span{color:#8290a1;font-size:11px}.debt-copy{flex:1}.debt-copy p{margin:0;color:#718096;font-size:12px}.debt-copy>strong{display:block;margin:5px 0 13px;font-size:25px}.debt-copy small{display:block;margin-top:8px;color:#7c8999}.linear-progress,.mini-progress{overflow:hidden;height:7px;border-radius:99px;background:#e8edf2}.linear-progress span,.mini-progress span{display:block;height:100%;border-radius:inherit;background:#0a8b72}.allocation-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #edf1f5}.allocation-row:last-child{border:0}.allocation-row .dot{width:10px;height:10px;border-radius:50%}.dot.emerald{background:#0a8b72}.dot.blue{background:#3986d7}.dot.amber{background:#d49317}.allocation-row div{display:flex;align-items:baseline;gap:8px}.allocation-row strong{font-size:17px}.allocation-row small,.allocation-row>span:last-child{color:#8390a0;font-size:11px}.text-button{padding:5px;background:transparent;color:#087b65}.supplier-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.supplier-card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:14px;border:1px solid #e6ebf0;border-radius:10px}.supplier-avatar{display:grid;place-items:center;width:39px;height:39px;border-radius:10px;background:#e8f7f2;color:#087b65;font-size:12px;font-weight:900}.supplier-info strong,.supplier-info span,.supplier-amount span,.supplier-amount strong{display:block}.supplier-info strong{font-size:13px}.supplier-info span,.supplier-amount span{margin-top:3px;color:#8995a3;font-size:10px}.supplier-amount{text-align:right}.supplier-amount strong{margin-top:3px;color:#cf4a4a;font-size:13px}.supplier-card .mini-progress{grid-column:1/-1;height:4px}.transaction-wrap{overflow-x:auto}.transaction-table{width:100%;border-collapse:collapse}.transaction-table th{padding:9px 12px;border-bottom:1px solid #e3e9ef;color:#7b8999;font-size:10px;text-align:left;text-transform:uppercase}.transaction-table th:last-child,.amount-cell{text-align:right}.transaction-table td{padding:12px;border-bottom:1px solid #eef2f5;color:#4b596b;font-size:12px}.transaction-table tr:last-child td{border:0}.type-badge{display:inline-flex;padding:4px 7px;border-radius:6px;background:#eef4fb;color:#336da8;font-size:10px;font-weight:800}.type-badge.out{background:#fff1f1;color:#bd4b4b}.amount-cell{font-weight:800!important}.amount-cell.in{color:#078064}.amount-cell.out{color:#c94b4b}.note-cell{max-width:360px;color:#748294!important}.empty-row{padding:36px!important;text-align:center;color:#98a4b1!important}.debt-list{display:grid;gap:10px}.debt-list article{display:grid;grid-template-columns:auto minmax(170px,1.3fr) 1fr 1fr auto;align-items:center;gap:14px;padding:14px;border:1px solid #e5ebf0;border-radius:10px}.debt-list h3,.debt-list p{margin:0}.debt-list h3{font-size:14px}.debt-list p,.debt-list span{display:block;margin-top:3px;color:#8a96a5;font-size:11px}.debt-list strong{display:block;margin-top:4px;font-size:13px}.debt-list button{padding:8px 10px;border:1px solid #b8dcd2;border-radius:8px;background:#f0faf7;color:#087b65;font-size:11px;font-weight:800;cursor:pointer}.fund-hero{display:flex;align-items:center;gap:18px;padding:25px;border-radius:13px;background:#0d725f;color:#fff}.fund-hero.profit{background:#956b12}.fund-symbol{display:grid;place-items:center;width:64px;height:64px;border-radius:14px;background:#ffffff20}.fund-hero p,.fund-hero span,.fund-hero strong{display:block;margin:0}.fund-hero p{font-size:11px;font-weight:800;letter-spacing:.12em;opacity:.75}.fund-hero strong{margin:5px 0;font-size:28px}.fund-hero span{font-size:12px;opacity:.8}.transaction-dialog{border-radius:14px!important}.transaction-dialog :deep(.v-card-title){padding:20px 22px 8px;font-size:18px;font-weight:800}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-grid label{display:grid;gap:6px;color:#596679;font-size:12px;font-weight:700}.form-grid .full{grid-column:1/-1}.form-grid input,.form-grid select,.form-grid textarea{width:100%;padding:10px 11px;border:1px solid #d7e0e8;border-radius:8px;background:#fff;color:#263246;font:inherit;font-size:13px;outline:none}.form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus{border-color:#0a8b72;box-shadow:0 0 0 3px #0a8b7218}.transaction-dialog :deep(.v-card-actions){justify-content:flex-end;padding:8px 22px 20px;gap:8px}
.overview-workspace{padding:12px 20px 16px;overflow:hidden}.overview-workspace .finance-header{min-height:38px;margin-bottom:6px}.overview-header>div:first-child{display:none}.overview-header{justify-content:flex-end}.overview-main{display:flex!important;flex-direction:column;gap:9px!important;width:100%!important;height:calc(100% - 44px)}.overview-funds,.overview-debts{min-width:0;width:100%;flex:0 0 auto!important}.overview-main>.repayment-panel{box-sizing:border-box!important;width:100%!important;max-width:none!important;height:116px!important;min-height:116px!important;max-height:116px!important;align-self:flex-start!important;flex:0 0 116px!important;overflow:hidden!important}.overview-main>.overview-history{display:flex!important;min-width:0!important;min-height:0!important;width:100%!important;height:auto!important;max-height:none!important;flex:1 1 0!important;flex-direction:column!important;overflow:hidden!important}.overview-main .section-label{margin-bottom:5px;font-size:9px}.overview-main .funds-grid,.overview-main .debt-blocks-grid{gap:9px}.overview-main .metric-block{padding:11px 13px;border-radius:9px}.overview-main .block-heading{min-height:18px;font-size:9px}.block-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;white-space:nowrap}.overview-main .block-heading button{padding:3px 6px;font-size:8px}.overview-main .block-heading button.add{border-color:#9bd7ca;background:#effbf8;color:#087b65}.overview-main .block-heading button.spend{border-color:#f1b8c3;background:#fff1f4;color:#b42343}.overview-main .block-heading button.withdraw{border-color:#ead19a;background:#fff8e8;color:#9a6500}.overview-main .block-heading button.supplier-add{border-color:#e8c27c;background:#fff8e8;color:#9a6500}.overview-main .metric-block>strong{margin:8px 0 3px;font-size:17px}.overview-main .metric-block>small{font-size:9px}.overview-main .repayment-panel{padding:11px 14px}.overview-main .repayment-heading{margin-bottom:7px}.overview-main .repayment-heading h2,.overview-main .history-heading h2{font-size:13px}.overview-main .repayment-heading p,.overview-main .history-heading p,.overview-main .history-panel .panel-title p{font-size:9px}.overview-main .repayment-heading>div:last-child span{padding:4px 8px}.overview-main .repayment-heading>div:last-child strong{font-size:17px}.overview-main .linear-progress{height:6px}.overview-main .repayment-stats{gap:8px;margin-top:7px}.overview-main .repayment-stats>div{padding:6px 8px}.overview-main .repayment-stats span{font-size:9px}.overview-main .repayment-stats strong{margin-top:2px;font-size:11px}.overview-main .history-heading{margin:0 0 5px}.overview-main .history-grid{width:100%;max-width:1180px;min-height:0;margin:0 auto;flex:1;gap:10px}.overview-main .history-panel{padding:10px 12px;overflow:hidden}.overview-main .history-panel .panel-title{margin-bottom:1px}.overview-main .history-panel .panel-title h2{font-size:12px}.overview-main .transaction-table th{padding:5px 8px;font-size:8px}.overview-main .transaction-table td{padding:6px 8px;font-size:10px}.overview-main .type-badge{padding:2px 5px;font-size:8px}.overview-main .empty-row{padding:18px!important}
.overview-main>.overview-history{display:flex!important;flex:1 1 0!important;min-height:190px!important;overflow:hidden!important}.overview-main .history-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;width:100%!important;max-width:none!important;min-height:0;margin:0!important;flex:1 1 0!important;align-items:stretch;justify-items:stretch;gap:14px}.overview-main .history-panel{box-sizing:border-box;width:100%!important;max-width:none!important;height:100%!important;min-height:0;padding:12px 14px;overflow:hidden;box-shadow:0 8px 22px rgba(36,54,79,.08)}.overview-main .history-panel .panel-title{padding-bottom:7px;margin-bottom:2px;border-bottom:1px solid #e8edf2}.overview-main .linear-progress{height:9px;padding:1px;border:1px solid #dce5ed;background:#e8edf2}.overview-main .linear-progress span{background:linear-gradient(90deg,#0a8b72,#16b99b)}.month-filter{display:flex;align-items:center;gap:7px;color:#63758a;font-size:10px;font-weight:700}.month-filter input{height:28px;padding:3px 9px;border:1px solid #d6e0e9;border-radius:7px;background:#fff;color:#253247;font:inherit;outline:none}.month-filter input:focus{border-color:#0a8b72;box-shadow:0 0 0 3px rgba(10,139,114,.12)}.transaction-table th:nth-child(3){text-align:right}.transaction-table th:last-child{text-align:left}.overview-main .transaction-table{table-layout:fixed}.overview-main .transaction-table th:nth-child(1){width:18%}.overview-main .transaction-table th:nth-child(2){width:25%}.overview-main .transaction-table th:nth-child(3){width:23%;text-align:right}.overview-main .transaction-table th:nth-child(4){width:34%}.overview-main .transaction-table td:nth-child(3){text-align:right}.overview-main .transaction-table .note-cell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.supplier-cell{font-size:10px}.supplier-cell.in{color:#078064}.supplier-cell.out{color:#c94b4b}
.finance-subpage{display:flex!important;flex-direction:column;gap:16px!important;width:100%;height:calc(100% - 92px);min-height:460px}.finance-subpage>.panel{box-sizing:border-box;width:100%;min-height:0;overflow:auto}.fund-subpage>.fund-hero{flex:0 0 132px;box-sizing:border-box;width:100%;box-shadow:0 10px 24px rgba(13,114,95,.14)}.fund-subpage>.panel{flex:1 1 0}.fund-subpage .transaction-wrap,.cashflow-subpage .transaction-wrap{height:calc(100% - 48px);min-height:0;overflow:auto}.fund-subpage .transaction-table,.cashflow-subpage .transaction-table{table-layout:fixed}.debts-subpage>.panel{display:flex;flex:1 1 0;flex-direction:column}.debts-subpage .panel-title{flex:0 0 auto}.debts-subpage .debt-list{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));height:100%;min-height:0;gap:12px}.debts-subpage .debt-list article{min-height:0;padding:18px 20px;background:#fbfcfe}.cashflow-subpage>.panel{display:flex;flex:1 1 0;flex-direction:column}.cashflow-subpage .panel-title{flex:0 0 auto}.cashflow-subpage .transaction-wrap{flex:1 1 0;height:auto}.finance-subpage .transaction-table thead{position:sticky;top:0;z-index:1;background:#fff}.finance-subpage .transaction-table th{padding-top:11px;padding-bottom:11px}.finance-subpage .transaction-table td{padding-top:14px;padding-bottom:14px}
.overview-main .section-label{font-size:10.5px;letter-spacing:.09em}.overview-main .metric-block{padding:13px 15px;border-width:1px;box-shadow:0 5px 14px rgba(36,54,79,.05)}.overview-main .block-heading{font-size:10px}.overview-main .block-heading button{padding:4px 7px;font-size:9px}.overview-main .metric-block>strong{margin:9px 0 4px;font-size:19px}.overview-main .metric-block>small{font-size:10px}.overview-main .funds-grid .metric-block:nth-child(1){border-color:#bed8f4;background:#f2f8ff}.overview-main .funds-grid .metric-block:nth-child(1) .block-heading{color:#356c9f}.overview-main .funds-grid .metric-block:nth-child(2){border-color:#bce3d8;background:#f1fbf7}.overview-main .funds-grid .metric-block:nth-child(2) .block-heading{color:#087b65}.overview-main .funds-grid .metric-block:nth-child(3){border-color:#ead7aa;background:#fffaf0}.overview-main .funds-grid .metric-block:nth-child(3) .block-heading{color:#956b12}.overview-main .debt-blocks-grid .metric-block:nth-child(1){border-color:#efd0d0;background:#fff7f7}.overview-main .debt-blocks-grid .metric-block:nth-child(2){border-color:#d9d1f1;background:#faf8ff}.overview-main .debt-blocks-grid .metric-block:nth-child(3){border-color:#c9dff1;background:#f5faff}.overview-main .debt-blocks-grid .total-debt-block{border-color:#a9ddcd;background:#eefaf6}.overview-main>.repayment-panel{height:128px!important;min-height:128px!important;max-height:128px!important;flex-basis:128px!important;border-color:#badfd6;background:#f7fcfa}.overview-main .repayment-heading h2,.overview-main .history-heading h2{font-size:15px}.overview-main .repayment-heading p,.overview-main .history-heading p,.overview-main .history-panel .panel-title p{font-size:10.5px}.overview-main .repayment-heading>div:last-child strong{font-size:19px}.overview-main .repayment-stats>div{padding:7px 10px;background:#fff}.overview-main .repayment-stats span{font-size:10px}.overview-main .repayment-stats strong{font-size:12.5px}.overview-main .history-panel{padding:15px 17px}.overview-main .history-panel:nth-child(1){border-color:#bdd8f0;background:#f6faff}.overview-main .history-panel:nth-child(2){border-color:#efd0d6;background:#fff8f9}.overview-main .history-panel:nth-child(1) .panel-title{border-color:#d8e8f5}.overview-main .history-panel:nth-child(2) .panel-title{border-color:#f2dfe3}.overview-main .history-panel .panel-title h2{font-size:14px}.overview-main .transaction-wrap{margin-top:5px;border:1px solid rgba(205,218,230,.8);border-radius:8px;background:rgba(255,255,255,.82);overflow:hidden}.overview-main .transaction-table th{padding:10px 14px;font-size:10px;line-height:1.3;background:rgba(246,249,252,.9)}.overview-main .transaction-table td{padding:11px 14px;font-size:12px;line-height:1.35;vertical-align:middle}.overview-main .transaction-table th:nth-child(1){width:17%}.overview-main .transaction-table th:nth-child(2){width:23%}.overview-main .transaction-table th:nth-child(3){width:25%}.overview-main .transaction-table th:nth-child(4){width:35%}.overview-main .transaction-table td:nth-child(1),.overview-main .transaction-table td:nth-child(2),.overview-main .transaction-table td:nth-child(3){white-space:nowrap}.overview-main .supplier-cell{font-size:12px}.overview-main .amount-cell{font-size:12px;color:#253247}.overview-main .note-cell{padding-left:18px!important}.finance-subpage>.panel{border-color:#d4e1eb;background:#fbfdff;box-shadow:0 8px 22px rgba(36,54,79,.07)}.finance-subpage .panel-title h2{font-size:18px}.finance-subpage .eyebrow{font-size:11px}.finance-subpage .transaction-wrap{border:1px solid #dce6ee;border-radius:9px;background:#fff}.finance-subpage .transaction-table th{padding:12px 16px;color:#60758c;font-size:11px;background:#f2f7fb}.finance-subpage .transaction-table td{padding:15px 16px;font-size:13px;line-height:1.45}.finance-subpage .type-badge{padding:5px 8px;font-size:11px}.fund-subpage>.panel{background:#f4fbf8;border-color:#bfe1d7}.profit-subpage>.panel{background:#fffaf0;border-color:#e8d6ac}.fund-hero p{font-size:12px}.fund-hero strong{font-size:32px}.fund-hero span{font-size:13px}.debts-subpage>.panel{background:#f7faff}.debts-subpage .debt-list article{border-left:4px solid #3c83c9;box-shadow:0 4px 12px rgba(36,54,79,.05)}.debts-subpage .debt-list article:nth-child(2){border-left-color:#7b61b3;background:#fbf9ff}.debts-subpage .debt-list article:nth-child(3){border-left-color:#0a8b72;background:#f4fbf8}.debts-subpage .debt-list h3{font-size:16px}.debts-subpage .debt-list p,.debts-subpage .debt-list span{font-size:12px}.debts-subpage .debt-list strong{font-size:16px}.cashflow-subpage>.panel{background:#f7faff}
.transaction-table{table-layout:fixed}.transaction-table th,.transaction-table td{box-sizing:border-box}.transaction-table th:nth-child(3),.transaction-table td:nth-child(3){padding-right:30px!important;text-align:right}.transaction-table th:nth-child(4),.transaction-table td:nth-child(4){padding-left:30px!important;text-align:left}.transaction-table tbody tr:not(:last-child) td{border-bottom:1px solid #e7edf2}.transaction-table tbody tr:hover td{background:rgba(235,243,249,.55)}.overview-main .transaction-table th{padding-top:11px;padding-bottom:11px;color:#64788d;font-size:10.5px;font-weight:800}.overview-main .transaction-table td{padding-top:12px;padding-bottom:12px;font-size:12px}.overview-main .transaction-table .note-cell{padding-left:30px!important}.overview-main .amount-cell{font-variant-numeric:tabular-nums}.overview-main .supplier-cell{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.finance-subpage .transaction-table th:nth-child(3),.finance-subpage .transaction-table td:nth-child(3){padding-right:36px!important}.finance-subpage .transaction-table th:nth-child(4),.finance-subpage .transaction-table td:nth-child(4){padding-left:36px!important}.finance-subpage .amount-cell{font-variant-numeric:tabular-nums}
.transaction-table th,.transaction-table td{vertical-align:top!important}.transaction-table th:nth-child(1),.transaction-table th:nth-child(2),.transaction-table th:nth-child(4){text-align:left!important}.transaction-table td:nth-child(1),.transaction-table td:nth-child(2),.transaction-table td:nth-child(4){text-align:left!important}.transaction-table th:nth-child(3),.transaction-table td:nth-child(3){text-align:right!important}.overview-main .transaction-table td{line-height:1.45}.overview-main .transaction-table .note-cell{white-space:normal}.overview-main .transaction-table tbody tr{height:auto}
.overview-main>.repayment-panel{height:172px!important;min-height:172px!important;max-height:172px!important;flex-basis:172px!important;padding:13px 16px}.overview-main .repayment-heading{margin-bottom:9px}.overview-main .repayment-heading h2{font-size:17px;line-height:1.25}.overview-main .repayment-heading p{margin-top:4px;font-size:11.5px}.overview-main .repayment-heading>div:last-child span{padding:5px 10px;font-size:11px}.overview-main .repayment-heading>div:last-child strong{font-size:22px}.debt-progress-track{box-sizing:border-box;width:100%;height:14px;padding:0;border:1px solid #a9cfc5;border-radius:999px;background-color:#dfeae7;overflow:hidden;box-shadow:inset 0 1px 2px rgba(36,74,65,.12);transition:background .35s ease}.overview-main .repayment-stats{margin-top:9px}.overview-main .repayment-stats>div{padding:8px 10px}.overview-main .repayment-stats span{font-size:11px}.overview-main .repayment-stats strong{margin-top:3px;font-size:14px}
.debt-progress-native{display:block;width:100%;height:16px;border:1px solid #9fc9be;border-radius:999px;background:#dfeae7;color:#087b65;accent-color:#087b65;appearance:none;-webkit-appearance:none;overflow:hidden}.debt-progress-native::-webkit-progress-bar{background:#dfeae7;border-radius:999px}.debt-progress-native::-webkit-progress-value{background:#087b65;border-radius:999px;box-shadow:0 1px 3px rgba(4,92,75,.25)}.debt-progress-native::-moz-progress-bar{background:#087b65;border-radius:999px}
.debt-progress-svg{display:block;width:100%;height:16px;overflow:visible}.debt-progress-background{fill:#dfeae7;stroke:#9fc9be;stroke-width:1}.debt-progress-value{fill:#087b65;filter:drop-shadow(0 1px 1px rgba(4,92,75,.22))}
.quick-allocation-button{position:fixed;right:22px;bottom:22px;z-index:30;display:inline-flex;align-items:center;gap:8px;padding:12px 17px;border:0;border-radius:999px;background:#08c9aa;color:#073b33;font:inherit;font-size:13px;font-weight:900;cursor:pointer;box-shadow:0 10px 24px rgba(8,139,116,.28);transition:transform .18s ease,background .18s ease,box-shadow .18s ease}.quick-allocation-button:hover{background:#10d6b5;transform:translateY(-2px);box-shadow:0 13px 28px rgba(8,139,116,.34)}.quick-allocation-button:focus-visible{outline:3px solid rgba(8,123,101,.25);outline-offset:3px}.allocation-dialog{border-radius:14px!important;overflow:hidden}.allocation-dialog-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px 14px;border-bottom:1px solid #e5ebf0}.allocation-dialog-header .eyebrow{margin-bottom:3px;color:#087b65}.allocation-dialog-header h2{margin:0;color:#1f2d3d;font-size:19px}.allocation-dialog-header>button{display:grid;place-items:center;width:34px;height:34px;border:1px solid #dde6ed;border-radius:8px;background:#f7f9fb;color:#64758a;cursor:pointer}.allocation-description{margin:0 0 18px;color:#6e7f91;font-size:12px;line-height:1.55}.allocation-amount-field{display:grid;gap:7px;color:#44566b;font-size:12px;font-weight:800}.allocation-amount-field>div{display:flex;align-items:center;border:1px solid #cedbe5;border-radius:9px;background:#fff;overflow:hidden}.allocation-amount-field input{min-width:0;flex:1;padding:11px 13px;border:0;background:transparent;color:#152338;font:inherit;font-size:16px;font-weight:800;outline:none}.allocation-amount-field>div:focus-within{border-color:#0a8b72;box-shadow:0 0 0 3px rgba(10,139,114,.12)}.allocation-amount-field strong{padding:0 13px;color:#087b65;font-size:16px}.allocation-results{display:grid;gap:9px;margin-top:16px}.allocation-results article{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 13px;border:1px solid #dce6ed;border-left-width:4px;border-radius:9px;background:#f9fbfd}.allocation-results article>div{display:flex;align-items:center;gap:10px;min-width:0}.allocation-results article>div>span{display:grid;place-items:center;width:27px;height:27px;flex:0 0 auto;border-radius:7px;background:#edf2f6;color:#6f8093;font-size:10px;font-weight:900}.allocation-results p,.allocation-results small{display:block;margin:0}.allocation-results p{color:#304158;font-size:12px;font-weight:800}.allocation-results small{margin-top:2px;color:#8593a3;font-size:10px;font-weight:600}.allocation-results article>strong{flex:0 0 auto;font-size:13px;font-variant-numeric:tabular-nums}.allocation-results .debt{border-left-color:#2779c5;background:#f5faff}.allocation-results .debt>strong{color:#246ba9}.allocation-results .reserve{border-left-color:#0a8b72;background:#f3fbf8}.allocation-results .reserve>strong{color:#087b65}.allocation-results .profit{border-left-color:#d19217;background:#fffaf0}.allocation-results .profit>strong{color:#a86c00}.allocation-empty{display:flex;align-items:center;justify-content:center;gap:9px;min-height:86px;margin-top:16px;border:1px dashed #cedae4;border-radius:9px;background:#f8fafc;color:#8090a1;font-size:12px}.allocation-ratio-note{margin:16px 0 0;padding-top:12px;border-top:1px solid #e8edf2;color:#8996a5;font-size:10px;text-align:center}
.sync-pill{border-color:#c9ddf2;color:#2869aa}.primary-action{background:#1a6fd4;color:#fff;box-shadow:0 4px 10px rgba(26,111,212,.16)}.primary-action:hover{background:#125bb3}.primary-action:focus-visible{outline:3px solid rgba(26,111,212,.22);outline-offset:2px}.block-heading button:hover,.history-heading button:hover{border-color:#79ace0;color:#155fae}.overview-main .block-heading button.add,.overview-main .block-heading button.supplier-add{border-color:#9fc5ea;background:#edf5ff;color:#155fae}.overview-main .block-heading button.add:hover,.overview-main .block-heading button.supplier-add:hover{border-color:#1a6fd4;background:#dcecff;color:#0f519b}.debt-list button{border-color:#9fc5ea;background:#edf5ff;color:#155fae}.debt-list button:hover{border-color:#1a6fd4;background:#dcecff}.quick-allocation-button{background:#1a6fd4;color:#fff;box-shadow:0 10px 24px rgba(26,111,212,.28)}.quick-allocation-button:hover{background:#125bb3;box-shadow:0 13px 28px rgba(26,111,212,.34)}.quick-allocation-button:focus-visible{outline-color:rgba(26,111,212,.26)}.allocation-dialog-header .eyebrow{color:#1a6fd4}.allocation-dialog-header>button:hover{border-color:#9fc5ea;background:#edf5ff;color:#155fae}.allocation-amount-field>div:focus-within{border-color:#1a6fd4;box-shadow:0 0 0 3px rgba(26,111,212,.12)}.allocation-amount-field strong{color:#1a6fd4}.transaction-dialog .form-grid input:focus,.transaction-dialog .form-grid select:focus,.transaction-dialog .form-grid textarea:focus{border-color:#1a6fd4;box-shadow:0 0 0 3px rgba(26,111,212,.12)}
:deep(.transaction-table){width:100%;table-layout:fixed;border-collapse:collapse}:deep(.transaction-table th),:deep(.transaction-table td){box-sizing:border-box;vertical-align:top!important}:deep(.transaction-table th:nth-child(1)),:deep(.transaction-table td:nth-child(1)){padding-left:18px!important;padding-right:18px!important;text-align:left!important}:deep(.transaction-table th:nth-child(2)),:deep(.transaction-table td:nth-child(2)){padding-left:18px!important;padding-right:18px!important;text-align:left!important}:deep(.transaction-table th:nth-child(3)),:deep(.transaction-table td:nth-child(3)){padding-left:18px!important;padding-right:32px!important;text-align:right!important}:deep(.transaction-table th:nth-child(4)),:deep(.transaction-table td:nth-child(4)){padding-left:32px!important;padding-right:18px!important;text-align:left!important}:deep(.transaction-table th){font-weight:800}:deep(.transaction-table td:nth-child(1)),:deep(.transaction-table td:nth-child(2)),:deep(.transaction-table td:nth-child(3)){white-space:nowrap}
:deep(.transaction-table th),:deep(.transaction-table td){padding-left:18px!important;padding-right:18px!important;text-align:center!important}:deep(.transaction-table th:nth-child(1)),:deep(.transaction-table th:nth-child(2)),:deep(.transaction-table th:nth-child(3)),:deep(.transaction-table th:nth-child(4)),:deep(.transaction-table td:nth-child(1)),:deep(.transaction-table td:nth-child(2)),:deep(.transaction-table td:nth-child(3)),:deep(.transaction-table td:nth-child(4)){text-align:center!important}:deep(.transaction-table .supplier-cell){display:inline-block;text-align:center!important}:deep(.transaction-table .note-cell){text-align:center!important}
.overview-main .repayment-heading h2{font-size:20px}.overview-main .repayment-heading p{font-size:14.5px}.overview-main .repayment-heading>div:last-child .repay-debt-button{font-size:14px}.overview-main .repayment-heading>div:last-child strong{font-size:25px}.overview-main .repayment-stats span{font-size:14px}.overview-main .repayment-stats strong{font-size:17px}
@media(max-width:1100px){.overview-workspace{overflow-y:auto}.overview-main{height:auto;grid-template-rows:none}.finance-subpage{height:auto;min-height:0}.funds-grid{grid-template-columns:repeat(2,1fr)}.debt-blocks-grid{grid-template-columns:repeat(2,1fr)}.history-grid{grid-template-columns:1fr}.overview-main .history-grid{grid-template-columns:1fr!important}.debts-subpage .debt-list{grid-template-rows:none;height:auto}.kpi-grid{grid-template-columns:repeat(2,1fr)}.supplier-grid{grid-template-columns:1fr}.debt-list article{grid-template-columns:auto 1fr 1fr}.debt-list article button{grid-column:2/-1}.overview-grid{grid-template-columns:1fr}}
@media(max-width:650px){.finance-layout{grid-template-columns:72px minmax(0,1fr)}.finance-sidebar{padding:10px 7px}.sidebar-title{justify-content:center;padding:8px 4px 13px}.sidebar-title span,.finance-sidebar button span{display:none}.finance-sidebar button{justify-content:center;padding:12px 8px}.finance-workspace{padding:16px 12px 90px;border-top-left-radius:18px}.finance-header{align-items:flex-start;flex-direction:column}.header-actions{width:100%}.sync-pill{display:none}.primary-action{flex:1}.funds-grid,.debt-blocks-grid,.repayment-stats{grid-template-columns:1fr}.metric-block{padding:15px}.history-heading,.repayment-heading{align-items:flex-start;flex-direction:column}.repayment-heading>div:last-child{align-self:flex-end}.kpi-grid{grid-template-columns:1fr}.debt-summary{align-items:flex-start;flex-direction:column}.progress-ring{margin:auto}.supplier-card{grid-template-columns:auto 1fr}.supplier-amount{grid-column:2;text-align:left}.debt-list article{grid-template-columns:auto 1fr}.debt-list article>div:nth-child(n+3){grid-column:2}.form-grid{grid-template-columns:1fr}.form-grid .full{grid-column:auto}}
@media(max-width:650px){.quick-allocation-button{right:14px;bottom:14px;padding:11px 13px}.quick-allocation-button span{display:none}.allocation-dialog-header{padding:17px 18px 13px}.allocation-results article{align-items:flex-start;flex-direction:column;gap:7px}.allocation-results article>strong{padding-left:37px}}
.wallet-hero{background:#1a5da0}.wallet-subpage>.fund-hero{flex:0 0 132px;box-sizing:border-box;width:100%;box-shadow:0 10px 24px rgba(26,93,160,.18)}.wallet-subpage>.panel{flex:1 1 0;background:#f5f8ff;border-color:#c2d4ef}.wallet-subpage>.panel .transaction-wrap,.wallet-subpage .transaction-wrap{height:calc(100% - 48px);min-height:0;overflow:auto}.wallet-subpage .transaction-table{table-layout:fixed}.wallet-filter-area{display:flex;align-items:center;gap:10px;margin-left:auto}.wallet-month-filter span{color:rgba(255,255,255,.75)}.wallet-month-filter input{border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.15);color:#fff;height:30px;padding:3px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.35);font:inherit;outline:none}.wallet-month-filter input:focus{border-color:rgba(255,255,255,.7);background:rgba(255,255,255,.2)}.wallet-clear-btn{padding:5px 10px;border:1px solid rgba(255,255,255,.35);border-radius:7px;background:rgba(255,255,255,.15);color:#fff;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.wallet-clear-btn:hover{background:rgba(255,255,255,.25)}
</style>
