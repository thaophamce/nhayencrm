<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  QuoteVipPanel.vue — Máy tính báo giá thiệp cưới cao cấp (VIP Luxury).
  Tra cứu theo mã thiệp (Auto-complete), preview hình ảnh + chất liệu/quy cách,
  tính giá VAT / trước VAT, phí làm khuôn, phí số lượng ít và phí vận chuyển.
-->
<template>
  <div class="qpv-root">
    <div class="qpv-scroll">
      <!-- Search code form -->
      <form class="qpv-form" @submit.prevent="findProduct">
        <label for="vip-code" class="qpv-label">MÃ THIỆP CƯỚI</label>
        <div class="qpv-code-field">
          <div class="qpv-code-input">
            <input
              id="vip-code"
              v-model="searchInput"
              type="text"
              autocomplete="off"
              placeholder="Nhập mã, ví dụ DQ-BTN26-653..."
              role="combobox"
              aria-autocomplete="list"
              :aria-expanded="showSuggestions"
              @focus="onFocus"
              @input="onInput"
              @keydown="onKeydown"
            />
            <button type="submit" title="Tra mã" aria-label="Tra mã">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
            </button>
          </div>

          <!-- Suggestions dropdown -->
          <div v-if="showSuggestions" class="qpv-suggestions" role="listbox">
            <template v-if="visibleSuggestionKeys.length > 0">
              <button
                v-for="(key, index) in visibleSuggestionKeys"
                :key="key"
                type="button"
                class="qpv-suggestion"
                :class="{ active: index === suggestionIndex }"
                @mousedown.prevent="selectSuggestion(key)"
              >
                <strong>{{ products[key]?.displayCode || key }}</strong>
                <small>{{ products[key]?.paper || 'Thiệp cưới Luxury' }}</small>
              </button>
            </template>
            <p v-else class="qpv-suggestion-empty">Không tìm thấy mã phù hợp</p>
          </div>
        </div>

        <p class="qpv-status" :class="{ error: isStatusError }">{{ statusText }}</p>

        <!-- Preview Card -->
        <div v-if="current" class="qpv-card-preview">
          <img :src="imgSrc" :alt="current.displayCode" @error="onImgError" />
          <div class="qpv-preview-info">
            <div class="qpv-preview-code">Mã thiệp: {{ current.displayCode }}</div>
            <div class="qpv-preview-paper">{{ current.paper }}</div>
          </div>
        </div>

        <!-- Quantity input -->
        <label for="vip-qty" class="qpv-label">SỐ LƯỢNG (BỘ)</label>
        <input
          id="vip-qty"
          v-model.number="quantity"
          type="number"
          inputmode="numeric"
          min="1"
          step="50"
          class="qpv-qty-input"
          @input="recalculate"
        />

        <!-- Preset quantity buttons -->
        <div class="qpv-qty-presets">
          <button v-for="q in [100, 200, 300, 500]" :key="q" type="button" class="qpv-qty-btn" :class="{ active: quantity === q }" @click="setQuantity(q)">
            {{ q }} bộ
          </button>
        </div>
      </form>

      <!-- Summary result -->
      <div class="qpv-summary">
        <div class="qpv-sum-row">
          <span>Đơn giá</span>
          <strong>{{ unitPriceText }}</strong>
        </div>
        <div class="qpv-sum-row">
          <span>Phí số lượng ít</span>
          <strong>{{ smallFeeText }}</strong>
        </div>
        <div class="qpv-sum-row">
          <span>Phí làm khuôn</span>
          <strong>{{ moldFeeText }}</strong>
        </div>
        <hr class="qpv-hr" />
        <div class="qpv-sum-row total">
          <span>Tổng chi phí</span>
          <strong>{{ totalPriceText }}</strong>
        </div>
        <div class="qpv-sum-row shipping">
          <span>Vận chuyển</span>
          <strong>{{ shippingTextVal }}</strong>
        </div>
      </div>

      <!-- Actions -->
      <div class="qpv-actions">
        <button type="button" class="qpv-btn primary" :disabled="!canCopy" @click="insertQuote">
          Chèn vào ô soạn tin
        </button>
        <button type="button" class="qpv-btn secondary" :disabled="!canCopy" @click="copyQuote">
          Copy
        </button>
      </div>

      <div v-if="toastMsg" class="qpv-toast">{{ toastMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useToast } from '@/composables/use-toast';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const toast = useToast();

interface VipProduct {
  displayCode: string;
  paper: string;
  price: number;
  preVat: number;
  moldFee: number;
  family: string;
  material: string[];
  specs: string[];
  imgKey?: string;
}

const products = ref<Record<string, VipProduct>>({});
const searchInput = ref('DQ-25VIP02-MT XANH FOREST');
const quantity = ref(300);
const currentKey = ref<string | null>(null);
const current = ref<VipProduct | null>(null);
const statusText = ref('');
const isStatusError = ref(false);
const showSuggestions = ref(false);
const suggestionIndex = ref(-1);
const visibleSuggestionKeys = ref<string[]>([]);
const toastMsg = ref('');

const money = new Intl.NumberFormat('vi-VN');

// Clean code string
function cleanCode(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function getOrderRule(family: string, qty: number) {
  if (['TTD26', 'TTN20', 'TTN25', 'BTN106'].includes(family)) {
    if (qty < 300) return { fee: 500000, minimum: 300, rejected: false };
    return { fee: 0, minimum: 300, rejected: false };
  }
  if (['BTN26', 'BTN114', 'BTD110'].includes(family)) {
    if (qty < 300) return { fee: 500000, minimum: 300, rejected: false };
    return { fee: 0, minimum: 300, rejected: false };
  }
  if (qty < 100) return { fee: 0, minimum: 100, rejected: true };
  if (qty < 300) return { fee: 500000, minimum: 100, rejected: false };
  return { fee: 0, minimum: 100, rejected: false };
}

function getUnitPrice(product: VipProduct, qty: number): number {
  let discount = 0;
  if (qty >= 1000) discount = 300;
  else if (qty >= 500) discount = 200;
  // `price` in the imported Luxury catalogue is already preVat x2.
  // The confirmed selling unit price is the source `preVat` value.
  return Math.max(0, product.preVat - discount);
}

function getShippingText(qty: number): string {
  if (qty < 50) return '—';
  if (qty <= 149) return '35.000đ – 40.000đ';
  if (qty <= 399) return '45.000đ – 50.000đ';
  if (qty <= 799) return '60.000đ – 90.000đ';
  return '100.000đ – 150.000đ';
}

function getShippingWeightText(qty: number): string {
  const weightInGrams = qty * 20;
  return weightInGrams >= 1000 ? `${(weightInGrams / 1000).toFixed(1)}kg` : `${weightInGrams}g`;
}

const unitPriceVal = computed(() => {
  if (!current.value || quantity.value <= 0) return 0;
  return getUnitPrice(current.value, quantity.value);
});

const orderRuleVal = computed(() => {
  if (!current.value) return { fee: 0, minimum: 100, rejected: false };
  return getOrderRule(current.value.family, quantity.value);
});

const totalMoldVal = computed(() => current.value?.moldFee || 0);

const totalCostVal = computed(() => {
  if (!current.value || orderRuleVal.value.rejected || quantity.value <= 0) return 0;
  return unitPriceVal.value * quantity.value + orderRuleVal.value.fee + totalMoldVal.value;
});

const unitPriceText = computed(() => current.value && unitPriceVal.value ? `${money.format(unitPriceVal.value)}đ/bộ` : '—');
const smallFeeText = computed(() => orderRuleVal.value.fee ? `${money.format(orderRuleVal.value.fee)}đ` : '—');
const moldFeeText = computed(() => totalMoldVal.value ? `${money.format(totalMoldVal.value)}đ` : '—');
const totalPriceText = computed(() => totalCostVal.value ? `${money.format(totalCostVal.value)}đ` : '—');
const shippingTextVal = computed(() => getShippingText(quantity.value));

const canCopy = computed(() => current.value && !orderRuleVal.value.rejected && quantity.value > 0);

const imageManifest = ref<string[]>([]);

onMounted(async () => {
  try {
    const res = await fetch('/thiep-images/manifest.json');
    if (res.ok) {
      imageManifest.value = await res.json();
    }
  } catch {}
});

function normImgName(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/Đ/g, "D").replace(/đ/g, "d").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

const imgSrc = computed(() => {
  if (!current.value) return '/logovip.png';
  const key = current.value.imgKey || current.value.displayCode;
  const targetClean = normImgName(key);

  // 1. Tìm file trong manifest khớp tên
  if (imageManifest.value.length > 0) {
    const found = imageManifest.value.find(file => {
      const fileClean = normImgName(file.replace(/\.jpg$/i, ''));
      return fileClean === targetClean || fileClean.startsWith(targetClean) || targetClean.startsWith(fileClean);
    });
    if (found) {
      return `/thiep-images/${encodeURIComponent(found)}`;
    }
  }

  return `/thiep-images/${key}.jpg`;
});

function onImgError(e: Event) {
  const target = e.target as HTMLImageElement;
  if (!current.value) return;
  const key = current.value.imgKey || current.value.displayCode;

  if (!target.dataset.tried) {
    target.dataset.tried = '1';
    target.src = `/thiep-images/${encodeURIComponent(key + ' copy.jpg')}`;
  } else {
    target.src = '/logovip.png';
  }
}

function setQuantity(q: number) {
  quantity.value = q;
  recalculate();
}

function recalculate() {
  if (!current.value) {
    statusText.value = 'Vui lòng chọn hoặc nhập đúng mã thiệp.';
    isStatusError.value = true;
    return;
  }
  const rule = orderRuleVal.value;
  if (rule.rejected) {
    statusText.value = `Mẫu này nhận tối thiểu ${rule.minimum} bộ.`;
    isStatusError.value = true;
  } else {
    statusText.value = `✓ Đã nhận diện ${current.value.displayCode}`;
    isStatusError.value = false;
  }
}

function findProduct() {
  const inputClean = cleanCode(searchInput.value);
  if (!inputClean) {
    current.value = null;
    currentKey.value = null;
    recalculate();
    return;
  }
  const exactKey = Object.keys(products.value).find(k => k === inputClean);
  const foundKey = exactKey || Object.keys(products.value).find(k => k.includes(inputClean));

  if (foundKey) {
    currentKey.value = foundKey;
    current.value = products.value[foundKey];
    searchInput.value = current.value.displayCode;
  } else {
    current.value = null;
    currentKey.value = null;
    statusText.value = `Không tìm thấy mã "${searchInput.value}"`;
    isStatusError.value = true;
  }
  showSuggestions.value = false;
  recalculate();
}

function renderSuggestions() {
  const query = cleanCode(searchInput.value);
  const keys = Object.keys(products.value);
  if (!query) {
    visibleSuggestionKeys.value = keys.slice(0, 10);
  } else {
    visibleSuggestionKeys.value = keys.filter(k => k.includes(query)).slice(0, 10);
  }
  suggestionIndex.value = -1;
  showSuggestions.value = true;
}

function selectSuggestion(key: string) {
  currentKey.value = key;
  current.value = products.value[key];
  if (current.value) {
    searchInput.value = current.value.displayCode;
  }
  showSuggestions.value = false;
  recalculate();
}

function onFocus() {
  renderSuggestions();
}

function onInput() {
  current.value = null;
  currentKey.value = null;
  recalculate();
  renderSuggestions();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (suggestionIndex.value < visibleSuggestionKeys.value.length - 1) {
      suggestionIndex.value++;
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (suggestionIndex.value > 0) {
      suggestionIndex.value--;
    }
  } else if (e.key === 'Escape') {
    showSuggestions.value = false;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (suggestionIndex.value >= 0 && visibleSuggestionKeys.value[suggestionIndex.value]) {
      selectSuggestion(visibleSuggestionKeys.value[suggestionIndex.value]);
    } else {
      showSuggestions.value = false;
      findProduct();
    }
  }
}

function buildMessageText(): string {
  if (!current.value) return '';
  const code = current.value.displayCode;
  const ship = getShippingText(quantity.value);
  const shippingWeight = getShippingWeightText(quantity.value);
  const uPrice = unitPriceVal.value;
  const qty = quantity.value;
  const total = totalCostVal.value;
  const rule = orderRuleVal.value;
  const moldFee = totalMoldVal.value;

  const lines = [
    "CÔNG TY TNHH IN ẤN NHÀ YẾN",
    "BÁO GIÁ THIỆP CƯỚI CAO CẤP LUXURY",
    "",
    `Mã thiệp: ${code}`,
    `Số lượng: ${money.format(qty)} bộ`,
    "",
    "Chất giấy:",
    ...current.value.material,
    "",
    "Quy cách:",
    ...current.value.specs,
    "",
    `Đơn giá: ${money.format(uPrice)}đ/bộ × ${money.format(qty)} bộ = ${money.format(uPrice * qty)}đ`
  ];

  if (moldFee) lines.push(`Phí làm khuôn: ${money.format(moldFee)}đ`);
  if (rule.fee) lines.push(`Phí số lượng ít: ${money.format(rule.fee)}đ (áp dụng dưới 300 bộ)`);

  lines.push(
    "",
    `TỔNG CHI PHÍ: ${money.format(total)}đ`,
    "",
    "Ghi chú khác:",
    "• Dòng thiệp cao cấp Luxury có thời gian nhận hàng dự kiến từ 8–10 ngày",
    "",
    `Phí ship Viettel Post: ${ship} (${money.format(qty)} thiệp ≈ ${shippingWeight})`
  );

  if (total <= 15000000) lines.push("Lưu ý: Báo giá chưa bao gồm phí vận chuyển.");

  lines.push(
    "",
    "QUÀ TẶNG",
    "• Thiệp video mời khách online trị giá 300.000đ",
    "• App Checklist Cưới – Ứng dụng quản lý kế hoạch cưới thông minh trị giá 500.000đ",
    "",
    "Dạ, anh/chị chưa hiểu phần nào thì nhắn em tư vấn chi tiết hơn nha. Em cảm ơn ạ!"
  );

  return lines.join("\n");
}

function insertQuote() {
  const msg = buildMessageText();
  if (!msg) return;
  window.dispatchEvent(
    new CustomEvent('chat:insert-suggestion', {
      detail: { text: msg },
      bubbles: true,
      composed: true,
    })
  );
  toast.success('Đã chèn báo giá thiệp VIP vào ô soạn tin');
}

async function copyQuote() {
  const msg = buildMessageText();
  if (!msg) return;
  try {
    await navigator.clipboard.writeText(msg);
    toast.success('Đã copy tin nhắn báo giá');
  } catch {
    toast.error('Không thể copy tự động');
  }
}

// Load products database
onMounted(async () => {
  try {
    const res = await fetch('/baogia/products.json');
    if (res.ok) {
      const data = await res.json();
      const map: Record<string, VipProduct> = {};
      
      // Chuyển array thành object có key là mã thiệp sạch (DQBTD102401...)
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          const key = cleanCode(item.code);
          map[key] = {
            displayCode: item.code,
            paper: item.paper,
            price: item.price,
            preVat: item.preVat,
            moldFee: item.moldFee || 0,
            family: item.family,
            material: item.material || [],
            specs: item.specs || [],
            imgKey: item.imgKey
          };
        });
      } else {
        Object.assign(map, data);
      }
      products.value = map;
    } else {
      loadFallbackProducts();
    }
  } catch {
    loadFallbackProducts();
  }
  findProduct();
});

function loadFallbackProducts() {
  products.value = {
    "DQ25VIP02MTXANHFOREST": {
      "displayCode": "DQ-25VIP02-MT Xanh Forest",
      "paper": "Giấy MT Xanh Forest 250g + ép kim + In lún + bế khuôn 12.5x18.5c",
      "price": 16500,
      "preVat": 8250,
      "moldFee": 670000,
      "family": "VIP02",
      "material": [
        "• Bao thư: Giấy MT Xanh Forest 250g, bế khuôn 12.5x18.5cm, dán túi sẵn",
        "• Lót: Giấy Kem NK 250g + In lún hoạ tiết + Ép kim nội dung"
      ],
      "specs": [
        "• Khuôn ép kim + Khuôn in lún: 670.000đ",
        "• Áp dụng từ 100 bộ trở lên"
      ]
    },
    "DQBTN26441": {
      "displayCode": "DQ-BTN26-441",
      "paper": "Giấy vân cao cấp 230g (bao thư và ruột thiệp cùng định lượng)",
      "price": 9200,
      "preVat": 9200,
      "moldFee": 200000,
      "family": "BTN26",
      "material": ["• Giấy vân cao cấp 230g (bao thư và ruột thiệp cùng định lượng)"],
      "specs": [
        "• Ruột thiệp: in 1 mặt + bế nổi không nhũ, kích thước 12.2x17.7cm",
        "• Bao thư: in 1 mặt + bế nổi không nhũ + bế khuôn kích thước 19x14cm"
      ]
    }
  };
}
</script>

<style scoped>
.qpv-root {
  display: flex;
  flex-direction: column;
  background: transparent;
}
.qpv-scroll {
  padding: 4px 12px 14px;
}
.qpv-label {
  display: block;
  margin: 10px 0 5px;
  color: #475467;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.qpv-code-field {
  position: relative;
}
.qpv-code-input {
  display: grid;
  grid-template-columns: 1fr 38px;
  gap: 6px;
}
.qpv-code-input input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  outline: 0;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  transition: all 0.15s ease;
}
.qpv-code-input input:focus {
  border-color: #2f80ed;
  box-shadow: 0 0 0 3px rgba(47, 128, 237, 0.15);
}
.qpv-code-input button {
  display: grid;
  place-items: center;
  border: none;
  border-radius: 8px;
  color: #fff;
  background: #2f80ed;
  cursor: pointer;
  transition: background 0.15s ease;
}
.qpv-code-input button:hover {
  background: #1d68d5;
}
.qpv-code-input svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}
.qpv-suggestions {
  position: absolute;
  z-index: 20;
  top: 42px;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12);
}
.qpv-suggestion {
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: background 0.15s ease;
}
.qpv-suggestion:hover,
.qpv-suggestion.active {
  background: #eff6ff;
}
.qpv-suggestion strong {
  font-size: 12px;
  color: #0f172a;
}
.qpv-suggestion small {
  font-size: 10px;
  color: #64748b;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.qpv-suggestion-empty {
  padding: 10px;
  font-size: 11px;
  color: #94a3b8;
  margin: 0;
  text-align: center;
}
.qpv-status {
  margin: 5px 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: #10b981;
  min-height: 16px;
}
.qpv-status.error {
  color: #ef4444;
}
.qpv-card-preview {
  margin: 6px 0 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.qpv-card-preview img {
  width: 100%;
  height: auto;
  object-fit: contain;
  display: block;
}
.qpv-preview-info {
  padding: 8px 10px;
  background: #fff;
  border-top: 1px solid #f1f5f9;
  text-align: center;
}
.qpv-preview-code {
  font-size: 12px;
  font-weight: 700;
  color: #2f80ed;
}
.qpv-preview-paper {
  font-size: 10.5px;
  color: #475467;
  margin-top: 3px;
  line-height: 1.4;
}
.qpv-qty-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: #1e293b;
  outline: 0;
}
.qpv-qty-input:focus {
  border-color: #2f80ed;
  box-shadow: 0 0 0 3px rgba(47, 128, 237, 0.15);
}
.qpv-qty-presets {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.qpv-qty-btn {
  flex: 1;
  padding: 6px 0;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff;
  color: #475467;
  cursor: pointer;
  transition: all 0.15s ease;
}
.qpv-qty-btn.active {
  border-color: #2f80ed;
  color: #2f80ed;
  background: #eff6ff;
  font-weight: 700;
}
.qpv-qty-btn:hover:not(.active) {
  border-color: #94a3b8;
  background: #f8fafc;
}
.qpv-summary {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}
.qpv-sum-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
  color: #64748b;
}
.qpv-sum-row strong {
  color: #1e293b;
  font-weight: 600;
}
.qpv-hr {
  margin: 6px 0;
  border: 0;
  border-top: 1px dashed #e2e8f0;
}
.qpv-sum-row.total {
  font-weight: 700;
  font-size: 12.5px;
  color: #0f172a;
}
.qpv-sum-row.total strong {
  color: #2f80ed;
  font-size: 16px;
  font-weight: 800;
}
.qpv-sum-row.shipping strong {
  color: #059669;
}
.qpv-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.qpv-btn {
  flex: 1;
  height: 38px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}
.qpv-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.qpv-btn.primary {
  background: #2f80ed;
  color: #fff;
  box-shadow: 0 2px 4px rgba(47, 128, 237, 0.25);
}
.qpv-btn.primary:not(:disabled):hover {
  background: #1d68d5;
}
.qpv-btn.secondary {
  flex: 0 0 76px;
  background: #fff;
  color: #2f80ed;
  border: 1.5px solid #2f80ed;
}
.qpv-btn.secondary:not(:disabled):hover {
  background: #eff6ff;
}
.qpv-toast {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  text-align: center;
}
</style>
