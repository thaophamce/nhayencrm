import { computed, ref } from 'vue';
import { api } from '@/api';
import type { DeliveryOrder } from '@/types/delivery';
export function useDeliveryOrders(){const orders=ref<DeliveryOrder[]>([]),loading=ref(false),total=ref(0),page=ref(1),limit=ref(20),filters=ref({search:'',paymentStatus:'',deliveryMethod:'',deliveryStatus:'',overdue:false});const totalPages=computed(()=>Math.max(1,Math.ceil(total.value/limit.value)));async function load(){loading.value=true;try{const {data}=await api.get('/delivery/orders',{params:{...filters.value,overdue:filters.value.overdue||undefined,page:page.value,limit:limit.value}});orders.value=data.orders||[];total.value=data.total||0;}finally{loading.value=false}}return{orders,loading,total,page,limit,filters,totalPages,load}}
