export const paymentStatuses=[{value:'unpaid',label:'Chưa thanh toán'},{value:'deposited',label:'Đã đặt cọc'},{value:'paid',label:'Đã thanh toán'}];
export const deliveryMethods=[{value:'viettelpost',label:'ViettelPost'},{value:'grab',label:'Grab'},{value:'chanh-xe',label:'Chành xe'},{value:'pickup',label:'Nhận tại xưởng'}];
export const workshopOptions=['Đà Nẵng','Vũng Tàu','Hóc Môn','Biên Hoà','Tân phú','ĐỨC QUYỀN'];
export const deliveryStatuses=[{value:'pending',label:'Chờ xác nhận'},{value:'confirmed',label:'Đã xác nhận'},{value:'shipping',label:'Đang giao'},{value:'delivered',label:'Giao thành công'},{value:'failed',label:'Giao thất bại'},{value:'returned',label:'Hoàn hàng'},{value:'cancelled',label:'Đã hủy'}];
export const label=(items:any[],value:string)=>items.find(x=>x.value===value)?.label||value;
