<template>
  <div class="order-panel">
    <div v-if="linkedOrder" class="linked-order" :class="linkedOrder.syncStatus">
      <div><b>Đơn Pancake {{ linkedOrder.orderCode || linkedOrder.pancakeOrderId }}</b><small>{{ linkedStatus }}</small></div>
      <button v-if="linkedOrder.syncStatus === 'rename_failed'" @click="retryRename">Thử đổi tên lại</button>
    </div>

    <div v-if="syncing" class="sync-state">Đang đồng bộ đơn {{ groupOrderCode }} từ Pancake…</div>
    <div v-else-if="syncedOrder" class="sync-state synced">Đã đồng bộ đơn {{ syncedOrder.orderCode }} từ Pancake</div>

    <main class="order-scroll">
      <section class="order-section customer-section">
        <h3><v-icon size="19">mdi-account-details-outline</v-icon> Khách hàng</h3>
        <div class="grid-2">
          <input v-model="customer.name" placeholder="Tên khách hàng" />
          <input v-model="customer.phone" placeholder="Số điện thoại" inputmode="tel" />
        </div>
        <input v-model="customer.address" placeholder="Địa chỉ" />
        <select v-model="warehouseId"><option value="">Chọn kho hàng</option><option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option></select>
        <div class="customer-chip"><span>{{ initials(customer.name) }}</span><b>{{ customer.name || 'Khách hàng mới' }}</b><v-icon size="18">mdi-chevron-down</v-icon></div>
      </section>

      <section class="order-section products-section">
        <h3><v-icon size="19">mdi-cart-outline</v-icon> Sản phẩm <small>{{ warehouseName }}</small></h3>
        <div class="product-table">
          <div class="product-columns"><b>Tên SP</b><b>SL:{{ totalQuantity }}</b><b>Đơn giá</b><b>Thành tiền</b></div>
          <div v-if="!items.length" class="product-empty"><v-icon size="42">mdi-inbox-outline</v-icon><span>Chưa có sản phẩm nào</span></div>
          <div v-for="(item,index) in items" :key="item.variation_id" class="product-row">
            <div><b>{{ item.name }}</b><small>{{ item.detail }}</small></div>
            <input v-model.number="item.quantity" type="number" min="1" />
            <input
              v-model.number="item.price"
              class="price-input"
              type="number"
              min="0"
              step="1000"
              inputmode="numeric"
              aria-label="Đơn giá"
              @focus="selectInput"
            />
            <span class="line-total">{{ money(item.price * item.quantity) }}</span>
            <button title="Xóa" @click="items.splice(index,1)">×</button>
          </div>
        </div>
        <div class="product-search">
          <v-icon size="17">mdi-magnify</v-icon><input v-model="search" placeholder="Tìm kiếm sản phẩm" @keyup.enter="loadProducts" />
          <button @click="showProducts = !showProducts">+</button>
        </div>
        <div v-if="showProducts" class="product-results">
          <div v-if="productLoading">Đang tải sản phẩm…</div>
          <button v-for="p in products" :key="p.id" @click="addProduct(p)"><span><b>{{ p.product?.name || p.display_id }}</b><small>{{ variationDetail(p) }}</small></span><strong>{{ money(p.retail_price) }}</strong></button>
          <div v-if="!productLoading && !products.length">Không tìm thấy sản phẩm</div>
        </div>
      </section>

      <section class="order-section payment-section">
        <h3><v-icon size="19">mdi-wallet-outline</v-icon> Thanh toán</h3>
        <label><input v-model="freeShipping" type="checkbox" /> Miễn phí giao hàng</label>
        <div class="sum-row"><span>Tổng giá trị đơn hàng</span><b>{{ money(subtotal) }}</b></div>
        <div class="sum-row"><span>Phí vận chuyển</span><input v-model.number="shippingFee" type="number" min="0" /></div>
        <div class="sum-row"><span>Giảm giá</span><input v-model.number="discount" type="number" min="0" /></div>
        <div class="sum-row"><span>Đã đặt cọc</span><input v-model.number="deposit" type="number" min="0" :max="total" /></div>
        <div class="sum-row amount-due"><span>Tiền cần thu</span><b>{{ money(amountDue) }}</b></div>
      </section>

      <section v-if="syncedOrder?.shipping" class="order-section shipping-section">
        <h3><v-icon size="19">mdi-truck-delivery-outline</v-icon> Vận chuyển <strong class="shipping-carrier">{{ syncedOrder.shipping.carrier }}</strong></h3>
        <div class="shipping-summary">
          <div><span>Mã vận đơn</span><b>{{ syncedOrder.shipping.trackingCode || '—' }}</b></div>
          <div><span>Phí vận chuyển</span><b>{{ money(syncedOrder.shipping.fee) }}</b></div>
        </div>
        <div class="shipping-card" :class="{ delivered: syncedOrder.shipping.status === 'delivered' }">
          <div class="shipping-status"><b>{{ shippingStatusLabel }}</b><small>{{ syncedOrder.shipping.statusText }}</small></div>
          <div v-if="syncedOrder.shipping.location"><b>Tại:</b> {{ syncedOrder.shipping.location }}</div>
          <div v-if="syncedOrder.shipping.updatedAt"><b>Lúc:</b> {{ dateTime(syncedOrder.shipping.updatedAt) }}</div>
          <div v-if="syncedOrder.shipping.note"><b>Ghi chú:</b> {{ syncedOrder.shipping.note }}</div>
          <div v-if="syncedOrder.shipping.deliveryName || syncedOrder.shipping.deliveryPhone"><b>Bưu tá:</b> {{ [syncedOrder.shipping.deliveryName, syncedOrder.shipping.deliveryPhone].filter(Boolean).join(' - ') }}</div>
          <a v-if="syncedOrder.shipping.trackingLink" :href="syncedOrder.shipping.trackingLink" target="_blank" rel="noopener noreferrer">Theo dõi vận đơn</a>
        </div>
      </section>
      <section class="order-section other-section">
        <h3><v-icon size="19">mdi-format-list-bulleted</v-icon> Thông tin khác</h3>
        <div class="info-row"><span>Tạo lúc</span><b>{{ createdAt }}</b></div>
        <div class="info-row"><span>Nguồn đơn</span><b>Thiệp Cưới</b></div>
        <label>Ghi chú nội bộ<textarea v-model="note" placeholder="Thêm ghi chú" /></label>
        <label>Ghi chú in<textarea v-model="printNote" placeholder="Thêm ghi chú" /></label>
      </section>
    </main>

    <footer class="order-footer"><strong>{{ money(total) }}</strong><div><button @click="reset">Thiết lập lại</button><button :disabled="submitting || syncing || (!!linkedOrder && !currentOrderCode)" @click="submitOrder">{{ submitting ? (currentOrderCode ? 'Đang lưu…' : 'Đang tạo…') : (currentOrderCode ? 'Lưu thay đổi' : linkedOrder ? 'Đã tạo đơn' : 'Tạo đơn') }}</button></div></footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import type { Contact } from '@/composables/use-contacts';
const props = defineProps<{ conversationId:string; groupName?:string|null; threadType?:'user'|'group'|null; contact?:Contact|null }>();
const toast=useToast(); const warehouses=ref<any[]>([]), products=ref<any[]>([]), items=ref<any[]>([]); const linkedOrder=ref<any>(null);
const syncing=ref(false), syncedOrder=ref<any>(null), pancakeCreatedAt=ref<string|null>(null);
const warehouseId=ref(''), search=ref(''), showProducts=ref(false), productLoading=ref(false), submitting=ref(false);
const freeShipping=ref(false), shippingFee=ref(0), discount=ref(0), deposit=ref(0), note=ref(''), printNote=ref('');
const customer=ref({name:'',phone:'',address:''});
const subtotal=computed(()=>items.value.reduce((s,i)=>s+i.price*i.quantity,0)); const totalQuantity=computed(()=>items.value.reduce((s,i)=>s+i.quantity,0));
const total=computed(()=>Math.max(0,subtotal.value+(freeShipping.value?0:Number(shippingFee.value)||0)-(Number(discount.value)||0)));
const amountDue=computed(()=>Math.max(0,total.value-(Number(deposit.value)||0)));
const warehouseName=computed(()=>warehouses.value.find(w=>w.id===warehouseId.value)?.name||'Chọn kho');
const currentOrderCode=computed(()=>String(syncedOrder.value?.orderCode||''));
const groupOrderCode=computed(()=>props.groupName?.trim().match(/^#?([A-Za-z][A-Za-z0-9_-]{2,39})(?:\s|$)/)?.[1]||'');
const createdAt=computed(()=>new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(pancakeCreatedAt.value?new Date(pancakeCreatedAt.value):new Date()));
const shippingStatusLabel=computed(()=>{
  const status=syncedOrder.value?.shipping?.status;
  return status==='delivered'?'Giao hàng thành công':status==='out_for_delivery'?'Đang giao hàng':status==='on_the_way'?'Đang vận chuyển':status==='request_received'?'Đã tiếp nhận vận đơn':'Trạng thái vận chuyển';
});
function dateTime(value:string){if(!value)return '';const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(date)}const linkedStatus=computed(()=>linkedOrder.value?.syncStatus==='rename_failed'?'Đã tạo đơn; chưa đổi tên nhóm':'Đã tạo đơn thành công');
function money(v:number){return new Intl.NumberFormat('vi-VN').format(Number(v)||0)+' đ'}
function selectInput(e:FocusEvent){(e.target as HTMLInputElement)?.select()}
function initials(v:string){return (v||'KH').trim().split(/\s+/).slice(-2).map(x=>x[0]).join('').toUpperCase()}
function variationDetail(p:any){return (p.fields||[]).map((f:any)=>`${f.name}: ${f.value}`).join(', ')}
function prefill(){customer.value={name:props.contact?.fullName||props.contact?.crmName||'',phone:props.contact?.phone||'',address:String(props.contact?.metadata?.address||'')}}
function applyPancakeOrder(order:any){
  syncedOrder.value=order; pancakeCreatedAt.value=order.createdAt||null;
  customer.value={name:order.customer?.name||'',phone:order.customer?.phone||'',address:order.customer?.address||''};
  warehouseId.value=order.warehouseId||warehouseId.value;
  items.value=(order.items||[]).map((i:any)=>({...i,quantity:Number(i.quantity)||1,price:Number(i.price)||0}));
  shippingFee.value=Number(order.shippingFee)||0; discount.value=Number(order.discount)||0;
  freeShipping.value=!!order.freeShipping; deposit.value=Number(order.qrPay)||0;
  note.value=order.note||''; printNote.value=order.printNote||'';
}
async function syncPancakeOrder(){
  if(!props.conversationId||!groupOrderCode.value)return;
  syncing.value=true;
  try{const {data}=await api.get(`/orders/pancake/sync-by-conversation/${props.conversationId}`);if(data.order)applyPancakeOrder(data.order)}
  catch(e:any){toast.error(e.response?.data?.error||'Không đồng bộ được đơn Pancake')}
  finally{syncing.value=false}
}async function loadLink(){try{const {data}=await api.get(`/orders/pancake/by-conversation/${props.conversationId}`);linkedOrder.value=data.link||null}catch{linkedOrder.value=null}}
async function loadWarehouses(){try{const {data}=await api.get('/orders/pancake/warehouses');warehouses.value=data.warehouses||[];warehouseId.value=warehouses.value.find(w=>w.allow_create_order)?.id||warehouses.value[0]?.id||''}catch{/* config may be absent */}}
async function loadProducts(){productLoading.value=true;showProducts.value=true;try{const {data}=await api.get('/orders/pancake/products',{params:{search:search.value,limit:30}});products.value=data.products||[]}catch(e:any){toast.error(e.response?.data?.error||'Không tải được sản phẩm')}finally{productLoading.value=false}}
function addProduct(p:any){const old=items.value.find(i=>i.variation_id===p.id);if(old)old.quantity++;else items.value.push({variation_id:p.id,product_id:p.product_id,name:p.product?.name||p.display_id,detail:variationDetail(p),price:Number(p.retail_price)||0,quantity:1});showProducts.value=false;search.value=''}
function orderPayload(){const paid=Math.max(0,Number(deposit.value)||0);return {warehouse_id:warehouseId.value,bill_full_name:customer.value.name.trim(),bill_phone_number:customer.value.phone.trim(),shipping_address:{address:customer.value.address.trim(),full_address:customer.value.address.trim(),full_name:customer.value.name.trim(),phone_number:customer.value.phone.trim()},note:note.value,note_print:printNote.value,items:items.value.map(i=>({variation_id:i.variation_id,product_id:i.product_id,quantity:i.quantity,variation_info:{name:i.name,detail:i.detail,retail_price:i.price}})),shipping_fee:freeShipping.value?0:shippingFee.value,total_discount:discount.value,is_free_shipping:freeShipping.value,charged_by_qrpay:paid}}
function validateOrder(){if((Number(deposit.value)||0)>total.value){toast.error('Tiền đặt cọc không được lớn hơn tổng giá trị đơn hàng');return false}return true}
async function submitOrder(){if(currentOrderCode.value)return savePancakeOrder();return createPancakeOrder()}
async function createPancakeOrder(){if(submitting.value||!validateOrder())return;submitting.value=true;try{const {data}=await api.post(`/orders/pancake/from-conversation/${props.conversationId}`,orderPayload());linkedOrder.value=data.link;toast.success(data.renameSucceeded&&props.threadType==='group'?`Đã tạo đơn ${data.link?.orderCode} và đổi tên nhóm`:`Đã tạo đơn ${data.link?.orderCode}`);await syncPancakeOrder()}catch(e:any){toast.error(e.response?.data?.error||'Tạo đơn thất bại');await loadLink()}finally{submitting.value=false}}
async function savePancakeOrder(){if(submitting.value||!validateOrder())return;submitting.value=true;try{const {data}=await api.put(`/orders/pancake/detail/${encodeURIComponent(currentOrderCode.value)}`,orderPayload());const order=data.order||data;syncedOrder.value=order;applyPancakeOrder(order);toast.success(`Đã lưu thay đổi đơn ${currentOrderCode.value}`)}catch(e:any){toast.error(e.response?.data?.error||'Lưu thay đổi thất bại')}finally{submitting.value=false}}
async function retryRename(){try{const {data}=await api.post(`/orders/pancake/from-conversation/${props.conversationId}/retry-rename`);linkedOrder.value=data.link;toast.success('Đã đổi tên nhóm')}catch(e:any){toast.error(e.response?.data?.error||'Không đổi được tên nhóm')}}
function reset(){items.value=[];shippingFee.value=0;discount.value=0;deposit.value=0;freeShipping.value=false;note.value='';printNote.value='';prefill()}
watch(()=>props.conversationId,()=>{reset();syncedOrder.value=null;loadLink();syncPancakeOrder()}); watch(()=>props.groupName,()=>{syncedOrder.value=null;syncPancakeOrder()}); watch(()=>props.contact,()=>{if(!syncedOrder.value)prefill()},{deep:false}); onMounted(async()=>{prefill();await loadWarehouses();loadLink();syncPancakeOrder()});
</script>

<style scoped>
.sync-state{padding:8px 12px;background:#fff7dc;color:#8a6200;border-bottom:1px solid #ecd78c;font-weight:600}.sync-state.synced{background:#effaf2;color:#20743b;border-color:#b9dfc4}.order-panel{height:100%;min-height:0;display:flex;flex-direction:column;background:#f3f5f9;color:#151922;font-size:13px}.order-scroll{overflow:auto;flex:1}.order-section{background:#fff;margin-top:7px;padding:10px 12px;border-top:1px solid #e4e7ed;border-bottom:1px solid #e4e7ed}.order-section h3{margin:0 0 10px;display:flex;align-items:center;gap:8px;font-size:14px}.order-section h3 small{margin-left:auto;color:#1767d5;font-weight:500}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:7px}.order-section input:not([type=checkbox]),.order-section select,.order-section textarea{width:100%;box-sizing:border-box;border:0;background:#f1f3f7;border-radius:4px;padding:7px 9px;outline:none;margin-bottom:6px;font:inherit}.customer-chip{background:#edf3ff;padding:9px;display:flex;align-items:center;gap:8px}.customer-chip span{width:32px;height:32px;border-radius:50%;background:#fff0d7;color:#f09b2d;display:grid;place-items:center}.customer-chip b{flex:1}.product-table{border:1px solid #e1e5ed;min-height:202px}.product-columns,.product-row{display:grid;grid-template-columns:2.2fr .55fr 1fr 1fr;gap:5px;align-items:center}.product-columns{background:#f0f1f6;padding:7px 9px}.product-columns b:not(:first-child){text-align:right}.product-empty{height:165px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8b93a7;gap:8px}.product-row{position:relative;padding:8px;border-top:1px solid #eee}.product-row div{display:flex;flex-direction:column}.product-row small{color:#81899a}.product-row input{margin:0!important;padding:4px!important;text-align:center}.product-row .price-input{text-align:right;background:#fff;border:1px solid #b8c5d9;border-radius:4px;color:#151922;font-weight:600;cursor:text}.product-row .price-input:focus{border-color:#316bc5;box-shadow:0 0 0 2px rgba(49,107,197,.15)}.product-row span{text-align:right}.product-row .line-total{font-size:15px;font-weight:800;color:#151922;white-space:nowrap}.product-row>button{position:absolute;right:2px;top:1px;border:0;background:none;color:#999}.product-search{display:flex;align-items:center;background:#f1f3f7;margin-top:10px;padding-left:10px}.product-search input{margin:0!important;flex:1}.product-search button{border:0;background:#316bc5;color:#fff;font-size:25px;width:34px;height:32px}.product-results{border:1px solid #dfe4ed;max-height:210px;overflow:auto;background:#fff}.product-results>div{padding:12px;color:#777}.product-results button{width:100%;border:0;border-bottom:1px solid #eee;background:#fff;padding:9px;display:flex;justify-content:space-between;text-align:left}.product-results span{display:flex;flex-direction:column}.product-results small{color:#777}.payment-section{display:grid;grid-template-columns:1fr 1fr;gap:7px 20px}.payment-section h3{grid-column:1/-1}.payment-section label{display:flex;gap:7px;align-items:center}.sum-row{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between}.sum-row input{width:125px!important;margin:0!important;text-align:right}.shipping-carrier{margin-left:auto;color:#087d83}.shipping-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.shipping-summary>div{background:#f1f3f7;padding:8px;border-radius:5px;display:flex;flex-direction:column;gap:3px}.shipping-summary span{color:#687386}.shipping-card{border:1px solid #e0a944;border-left:4px solid #e0a944;border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:7px;line-height:1.4}.shipping-card.delivered{border-color:#00858b;background:#f5ffff}.shipping-status{display:flex;justify-content:space-between;gap:8px;color:#936200}.shipping-card.delivered .shipping-status{color:#007b55}.shipping-status small{text-align:right;font-weight:600}.shipping-card a{color:#1767d5;font-weight:600;text-decoration:none}.info-row{display:flex;justify-content:space-between;padding:7px 0}.other-section label{display:grid;grid-template-columns:130px 1fr;align-items:start;margin-top:7px}.other-section textarea{resize:vertical}.linked-order{margin:7px 10px 0;padding:10px;border:1px solid #b8dfc2;background:#f1fff4;display:flex;justify-content:space-between}.linked-order div{display:flex;flex-direction:column}.linked-order small{color:#687386}.linked-order.rename_failed{border-color:#f2ce78;background:#fff9e9}.linked-order button{border:0;background:#e5a823;color:#fff;border-radius:4px}.order-footer{background:#fff;border-top:1px solid #dfe3eb;padding:8px 12px}.order-footer>strong{display:block;text-align:right;color:#e02020;margin-bottom:7px}.order-footer div{display:grid;grid-template-columns:1fr 1fr;gap:8px}.order-footer button{height:34px;border:0;border-radius:7px;font-weight:600}.order-footer button:first-child{background:#eef0f5;color:#9aa3b5}.order-footer button:last-child{background:#316bc5;color:#fff}.order-footer button:disabled{opacity:.55}
.sum-row b,.order-footer>strong{font-size:16px}
.amount-due{padding-top:7px;border-top:1px dashed #d7dce5}.amount-due b{color:#168000}
</style>
