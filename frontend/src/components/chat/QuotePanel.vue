<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  QuotePanel.vue — Máy tính báo giá thiệp cưới (port từ TRACKER/public/bao-gia.html).
  Giữ nguyên công thức gốc; style theo tông webapp (#2f80ed), không dùng tông vàng/Quicksand.
  Chèn báo giá vào ô soạn tin cột giữa qua window event 'chat:insert-suggestion'
  (MessageThread lắng nghe → applySuggestion), đồng bộ cơ chế với widget AI.
-->
<template>
  <div class="qp-root" :class="{ compact }">
    <div class="qp-scroll">
      <!-- Chọn loại giấy -->
      <div class="qp-section-label">Loại giấy</div>
      <div class="qp-paper-row">
        <button
          class="qp-paper"
          :class="{ on: type === 'nhunu' }"
          @click="selectType('nhunu')"
        >
          <span class="qp-paper-name">Ánh nhũ thơm</span>
          <span class="qp-paper-sub">Lấp lánh · nước hoa</span>
        </button>
        <button
          class="qp-paper"
          :class="{ on: type === 'standard' }"
          @click="selectType('standard')"
        >
          <span class="qp-paper-name">Tiêu chuẩn</span>
          <span class="qp-paper-sub">Không mùi</span>
        </button>
        <button
          class="qp-paper qp-paper-wide"
          :class="{ on: type === 'gap3in1' }"
          @click="selectType('gap3in1')"
        >
          <span class="qp-paper-name">Gập 3in1</span>
          <span class="qp-paper-sub">1 tờ gập 3 · có ngăn đựng tiền</span>
        </button>
      </div>

      <!-- Số lượng -->
      <div class="qp-section-label">Số lượng (bộ)</div>
      <input
        v-model.number="qty"
        type="number"
        min="50"
        step="10"
        inputmode="numeric"
        class="qp-qty-input"
        placeholder="Tối thiểu 50 bộ"
      />
      <div v-if="qty > 0 && qty < 50" class="qp-warn">⚠ Tối thiểu 50 bộ</div>

      <!-- Ép kim -->
      <label v-if="epAvailable" class="qp-epkim-toggle">
        <input v-model="epOn" type="checkbox" />
        <span class="qp-epkim-box" :class="{ on: epOn }"></span>
        <span>Ép kim / dập nổi</span>
      </label>
      <div v-if="epAvailable && epOn" class="qp-ep-box">
        <div class="qp-ep-field">
          <label>Số vị trí</label>
          <input v-model.number="epVitri" type="number" min="1" step="1" class="qp-ep-input" />
        </div>
        <div class="qp-ep-hint">Mỗi vị trí = 1 khuôn · 200.000đ/khuôn</div>
      </div>

      <!-- Kết quả -->
      <div class="qp-result">
        <div class="qp-res-row">
          <span>Đơn giá</span>
          <strong>{{ unitLabel }}</strong>
        </div>
        <div class="qp-res-row">
          <span>Tiền giấy</span>
          <strong>{{ display(giay) }}</strong>
        </div>
        <div v-if="epAvailable" class="qp-res-row" :class="{ dim: !epOn }">
          <span>Ép kim</span>
          <strong>{{ epOn ? display(ep) : '—' }}</strong>
        </div>
        <div class="qp-res-total">
          <span>Tổng chi phí</span>
          <strong>{{ display(total) }}</strong>
        </div>
        <div class="qp-res-avg">
          <span>Giá thành</span>
          <strong>{{ valid ? fmt(avg) + '/bộ' : '—' }}</strong>
        </div>
        <div v-if="ship" class="qp-res-ship">
          🚚 Ship: {{ ship.r }} <small>({{ qty }} thiệp ≈ {{ weightLabel }})</small>
        </div>
      </div>

      <div class="qp-actions">
        <button class="qp-btn qp-btn-primary" :disabled="!valid" @click="insertQuote">
          Chèn vào ô soạn tin
        </button>
        <button class="qp-btn qp-btn-ghost" :disabled="!valid" @click="copyQuote">
          Copy
        </button>
      </div>
      <div v-if="statusMsg" class="qp-status">{{ statusMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useToast } from '@/composables/use-toast';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

interface Tier { a: number; b: number; p: number }
type PaperType = 'standard' | 'nhunu' | 'gap3in1';
const P: Record<PaperType, Tier[]> = {
  standard: [
    { a: 50, b: 149, p: 8000 }, { a: 150, b: 399, p: 3900 },
    { a: 400, b: 799, p: 2700 }, { a: 800, b: 1e9, p: 2500 },
  ],
  nhunu: [
    { a: 50, b: 149, p: 8000 }, { a: 150, b: 399, p: 3900 },
    { a: 400, b: 799, p: 3400 }, { a: 800, b: 1e9, p: 2900 },
  ],
  gap3in1: [
    { a: 50, b: 149, p: 10000 }, { a: 150, b: 399, p: 4500 },
    { a: 400, b: 799, p: 4000 }, { a: 800, b: 1299, p: 3800 },
    { a: 1300, b: 1e9, p: 3500 },
  ],
};
const SHIP = [
  { a: 50, b: 149, r: '35.000đ – 40.000đ' },
  { a: 150, b: 399, r: '45.000đ – 50.000đ' },
  { a: 400, b: 799, r: '60.000đ – 90.000đ' },
  { a: 800, b: 1e9, r: '100.000đ – 150.000đ' },
];

const toast = useToast();
const type = ref<PaperType>('nhunu');
const qty = ref<number>(0);
const epOn = ref(false);
const epVitri = ref<number>(1);
const statusMsg = ref('');

const epAvailable = computed(() => type.value !== 'gap3in1');

function selectType(t: PaperType): void {
  type.value = t;
  if (t === 'gap3in1') epOn.value = false;
}

function fmt(n: number): string { return n.toLocaleString('vi-VN') + 'đ'; }
function getP(t: PaperType, q: number): number | null {
  return (P[t].find((x) => q >= x.a && q <= x.b) || { p: null }).p;
}

const unitPrice = computed(() => getP(type.value, qty.value));
const valid = computed(() => qty.value >= 50 && unitPrice.value != null);
const giay = computed(() => (valid.value ? qty.value * (unitPrice.value as number) : 0));
const epVitriSafe = computed(() => Math.max(1, epVitri.value || 1));
const ep = computed(() => {
  if (!epOn.value || !valid.value) return 0;
  const v = epVitriSafe.value;
  let e = qty.value * v * 1000 + v * 200000;
  if (qty.value < 300) e += 300000;
  return e;
});
const total = computed(() => giay.value + ep.value);
const avg = computed(() => (valid.value ? Math.round(total.value / qty.value) : 0));
const ship = computed(() => (valid.value ? SHIP.find((x) => qty.value >= x.a && qty.value <= x.b) || null : null));
const weightLabel = computed(() => {
  const wG = qty.value * 20;
  return wG >= 1000 ? (wG / 1000).toFixed(1) + 'kg' : wG + 'g';
});
const unitLabel = computed(() => (valid.value ? fmt(unitPrice.value as number) + '/bộ' : '—'));
function display(n: number): string { return valid.value ? fmt(n) : '—'; }

function buildText(): string | null {
  const q = qty.value;
  if (q < 50) return null;
  const st = SHIP.find((x) => q >= x.a && q <= x.b) || null;
  const wG = q * 20;
  const wD = wG >= 1000 ? (wG / 1000).toFixed(1) + 'kg' : wG + 'g';
  const shipTxt = st ? st.r : '—';

  if (type.value === 'gap3in1') {
    const up = getP('gap3in1', q);
    if (!up) return null;
    return [
      'CÔNG TY TNHH IN ẤN NHÀ YẾN',
      'BÁO GIÁ THIỆP CƯỚI GẬP 3IN1 NHÀ YẾN',
      'Số lượng: ' + q + ' thiệp',
      '(Quy cách: thiệp 1 tờ gập 3 có ngăn đựng tiền)',
      '',
      '** GIẤY ÁNH NHŨ LẤP LÁNH NƯỚC HOA THƠM',
      '* Đơn giá: ' + fmt(up) + ' x ' + q + ' bộ = ' + fmt(q * up),
      'Phí ship Viettel Post: ' + shipTxt + ' (' + q + ' thiệp ≈ ' + wD + ')',
      '',
      'Lưu ý: Hoá đơn chưa bao gồm phí ship.',
      'Quà tặng: ',
      '- Thiệp video mời khách online trị giá 300.000đ',
      '- App Checklist Cưới - Ứng dụng quản lý kế hoạch cưới thông minh trị giá 500.000đ',
      '',
      'Dạ mình chưa hiểu phần nào nhắn em tư vấn chi tiết hơn nha, em cảm ơn ạ.',
    ].join('\n');
  }

  const upS = getP('standard', q);
  const upN = getP('nhunu', q);
  if (!upS || !upN) return null;
  const ev = epOn.value ? epVitriSafe.value : 0;

  function block(name: 'standard' | 'nhunu', up: number): string {
    const g = q * up;
    const lines: string[] = [];
    lines.push('* Đơn giá: ' + fmt(up) + ' x ' + q + ' bộ = ' + fmt(g));
    if (epOn.value) {
      lines.push('* Ép kim/dập nổi: ' + ev + ' vị trí x ' + q + ' bộ x 1.000đ = ' + fmt(q * ev * 1000));
      lines.push('* Khuôn ép kim: ' + ev + ' khuôn x 200.000đ = ' + fmt(ev * 200000));
      if (q < 300) lines.push('* Phụ phí ép kim (dưới 300 thiệp): 300.000đ');
    }
    const tot = g + (epOn.value ? (q * ev * 1000 + ev * 200000 + (q < 300 ? 300000 : 0)) : 0);
    const av = Math.round(tot / q);
    const label = name === 'standard' ? 'GIẤY TIÊU CHUẨN' : 'GIẤY ÁNH NHŨ';
    lines.push('Tổng chi phí nếu chọn ' + label + ': ' + fmt(tot));
    lines.push('Tính ra 1 thiệp giá chỉ còn: ' + fmt(av) + '/thiệp');
    lines.push('Phí ship Viettel Post: ' + shipTxt + ' (' + q + ' thiệp ≈ ' + wD + ')');
    return lines.join('\n');
  }

  const lines: string[] = [
    'CÔNG TY TNHH IN ẤN NHÀ YẾN',
    'BÁO GIÁ THIỆP CƯỚI NHÀ YẾN',
    'Số lượng: ' + q + ' thiệp',
    '(Quy cách: Bao thư in 1 mặt, ruột 2 tờ rời in 1 mặt)',
    '',
  ];
  if (q > 399) {
    lines.push('** GIẤY TIÊU CHUẨN KHÔNG MÙI');
    lines.push(block('standard', upS));
    lines.push('');
  }
  lines.push('** GIẤY ÁNH NHŨ LẤP LÁNH NƯỚC HOA THƠM');
  lines.push(block('nhunu', upN));
  lines.push('');
  lines.push('Lưu ý: Hoá đơn chưa bao gồm phí ship.');
  lines.push('Quà tặng: ');
  lines.push('- Thiệp video mời khách online trị giá 300.000đ');
  lines.push('- App Checklist Cưới - Ứng dụng quản lý kế hoạch cưới thông minh trị giá 500.000đ');
  lines.push('');
  lines.push('Dạ mình chưa hiểu phần nào nhắn em tư vấn chi tiết hơn nha, em cảm ơn ạ.');
  return lines.join('\n');
}

function flashStatus(msg: string) {
  statusMsg.value = msg;
  window.setTimeout(() => { statusMsg.value = ''; }, 3500);
}

function insertQuote() {
  const txt = buildText();
  if (!txt) { flashStatus('⚠ Nhập đủ số lượng (tối thiểu 50 bộ) trước!'); return; }
  window.dispatchEvent(new CustomEvent('chat:insert-suggestion', { detail: { text: txt } }));
  toast.success('Đã chèn báo giá vào ô soạn tin');
}

async function copyQuote() {
  const txt = buildText();
  if (!txt) { flashStatus('⚠ Nhập đủ số lượng (tối thiểu 50 bộ) trước!'); return; }
  try {
    await navigator.clipboard.writeText(txt);
    flashStatus('✅ Đã copy báo giá');
  } catch {
    flashStatus('⚠ Trình duyệt chặn copy — thử lại');
  }
}
</script>

<style scoped>
.qp-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f7f8fc;
}
.qp-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 14px 20px;
}
.qp-section-label {
  font-size: 12px;
  font-weight: 700;
  color: #5f6173;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 14px 0 6px;
}
.qp-section-label:first-child { margin-top: 0; }
.qp-paper-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.qp-paper-wide { grid-column: 1 / -1; }
.qp-paper {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border: 1.5px solid #eaecef;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.qp-paper:hover { border-color: #b9d4fb; }
.qp-paper.on {
  border-color: #2f80ed;
  background: rgba(47, 128, 237, 0.06);
}
.qp-paper-name { font-size: 13.5px; font-weight: 700; color: #1e202c; }
.qp-paper-sub { font-size: 11px; color: #8a8d9c; }
.qp-qty-input,
.qp-ep-input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid #eaecef;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #1e202c;
  background: #fff;
  outline: none;
  font-family: inherit;
}
.qp-qty-input:focus,
.qp-ep-input:focus { border-color: #2f80ed; }
.qp-warn { font-size: 11.5px; color: #ff5a5f; margin-top: 4px; font-weight: 600; }
.qp-epkim-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
  color: #1e202c;
  user-select: none;
}
.qp-epkim-toggle input { display: none; }
.qp-epkim-box {
  width: 18px;
  height: 18px;
  border: 1.5px solid #cdd2da;
  border-radius: 5px;
  flex: 0 0 auto;
  position: relative;
  transition: all 0.15s;
}
.qp-epkim-box.on { background: #2f80ed; border-color: #2f80ed; }
.qp-epkim-box.on::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1px;
  width: 5px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.qp-ep-box {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid #eaecef;
  border-radius: 10px;
  background: #fff;
}
.qp-ep-field { display: flex; align-items: center; gap: 10px; }
.qp-ep-field label { font-size: 12.5px; color: #5f6173; font-weight: 600; flex: 0 0 auto; }
.qp-ep-field .qp-ep-input { max-width: 90px; }
.qp-ep-hint { font-size: 11px; color: #8a8d9c; margin-top: 6px; }
.qp-result {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid #eaecef;
  border-radius: 12px;
  background: #fff;
}
.qp-res-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
  font-size: 13px;
  color: #5f6173;
}
.qp-res-row strong { color: #1e202c; font-weight: 600; font-variant-numeric: tabular-nums; }
.qp-res-row.dim { opacity: 0.5; }
.qp-res-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed #eaecef;
  font-size: 14px;
  font-weight: 700;
  color: #1e202c;
}
.qp-res-total strong { color: #2f80ed; font-size: 16px; font-variant-numeric: tabular-nums; }
.qp-res-avg {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  font-size: 13px;
  color: #5f6173;
}
.qp-res-avg strong { color: #2ec4b6; font-weight: 700; font-variant-numeric: tabular-nums; }
.qp-res-ship {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #eaecef;
  font-size: 12px;
  color: #5f6173;
}
.qp-res-ship small { color: #8a8d9c; }
.qp-actions { display: flex; gap: 8px; margin-top: 16px; }
.qp-btn {
  flex: 1 1 0;
  padding: 11px 14px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  font-family: inherit;
  transition: all 0.15s;
}
.qp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.qp-btn-primary { background: #2f80ed; color: #fff; }
.qp-btn-primary:not(:disabled):hover { background: #1a6fd4; }
.qp-btn-ghost {
  flex: 0 0 auto;
  min-width: 84px;
  background: #fff;
  color: #2f80ed;
  border: 1.5px solid #2f80ed;
}
.qp-btn-ghost:not(:disabled):hover { background: rgba(47, 128, 237, 0.08); }
.qp-status {
  margin-top: 10px;
  font-size: 12px;
  color: #5f6173;
  text-align: center;
}

/* B?n g?n nh?ng tr?c ti?p trong PROFILE */
.qp-root.compact { flex: none; overflow: visible; background: transparent; }
.qp-root.compact .qp-scroll { overflow: visible; padding: 6px 12px 14px; }
.qp-root.compact .qp-section-label { margin: 8px 0 4px; font-size: 10.5px; }
.qp-root.compact .qp-paper-row { gap: 6px; }
.qp-root.compact .qp-paper { gap: 0; padding: 7px 9px; border-radius: 8px; }
.qp-root.compact .qp-paper-name { font-size: 12px; }
.qp-root.compact .qp-paper-sub { font-size: 10px; }
.qp-root.compact .qp-qty-input,
.qp-root.compact .qp-ep-input { padding: 7px 9px; border-radius: 8px; font-size: 13px; }
.qp-root.compact .qp-epkim-toggle { margin-top: 9px; font-size: 12px; }
.qp-root.compact .qp-ep-box { margin-top: 6px; padding: 8px; }
.qp-root.compact .qp-result { margin-top: 9px; padding: 9px 10px; border-radius: 9px; }
.qp-root.compact .qp-res-row { font-size: 11.5px; padding: 2px 0; }
.qp-root.compact .qp-res-total { margin-top: 5px; padding-top: 6px; }
.qp-root.compact .qp-res-total span { font-size: 12px; }
.qp-root.compact .qp-res-total strong { font-size: 16px; }
.qp-root.compact .qp-res-avg { padding: 3px 0; font-size: 11.5px; }
.qp-root.compact .qp-res-ship { margin-top: 4px; font-size: 10.5px; }
.qp-root.compact .qp-actions { margin-top: 8px; gap: 6px; }
.qp-root.compact .qp-btn { min-height: 32px; padding: 7px 9px; font-size: 11.5px; }

</style>
