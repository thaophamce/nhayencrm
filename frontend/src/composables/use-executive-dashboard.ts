import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '@/api';
import type {
  ExecutiveAlert,
  ExecutiveKpi,
  ExecutiveModule,
  HealthLevel,
} from '@/components/executive-dashboard/types';
import { getOrderStatsMonthValue } from '@/utils/order-stats-time';

type LoadKey = 'messages' | 'delivery' | 'design' | 'hr';
type LoadStatus = { loading: boolean; error: string };

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function count(value: unknown): string {
  return number(value).toLocaleString('vi-VN');
}

function compactMoney(value: unknown): string {
  const amount = number(value);
  if (Math.abs(amount) >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  return `${amount.toLocaleString('vi-VN')} đ`;
}

function health(value: number, attentionAt: number, criticalAt: number): HealthLevel {
  if (value >= criticalAt) return 'critical';
  if (value >= attentionAt) return 'attention';
  return 'healthy';
}

function healthLabel(level: HealthLevel): string {
  return {
    healthy: 'Ổn định',
    attention: 'Cần chú ý',
    critical: 'Cần xử lý',
    unavailable: 'Mất dữ liệu',
  }[level];
}

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { from: from.toISOString(), to: to.toISOString(), month, today };
}

export function useExecutiveDashboard() {
  const raw = reactive<Record<LoadKey, any>>({ messages: {}, delivery: {}, design: {}, hr: {} });
  const states = reactive<Record<LoadKey, LoadStatus>>({
    messages: { loading: true, error: '' },
    delivery: { loading: true, error: '' },
    design: { loading: true, error: '' },
    hr: { loading: true, error: '' },
  });
  const lastUpdated = ref<Date | null>(null);
  const refreshing = ref(false);

  async function loadPart(key: LoadKey, task: () => Promise<any>) {
    states[key].loading = true;
    states[key].error = '';
    try {
      raw[key] = await task();
    } catch (error: any) {
      states[key].error = error?.response?.status === 403 ? 'Tài khoản chưa có quyền xem khối này.' : 'Không thể kết nối máy chủ.';
    } finally {
      states[key].loading = false;
    }
  }

  async function loadMessages() {
    const [meResult, systemResult] = await Promise.allSettled([
      api.get('/dashboard/action-hub/me'),
      api.get('/dashboard/action-hub/system'),
    ]);
    if (meResult.status === 'rejected') throw meResult.reason;
    return {
      me: meResult.value.data,
      system: systemResult.status === 'fulfilled' ? systemResult.value.data : null,
    };
  }

  async function loadDelivery() {
    const { from, to } = monthRange();
    return (await api.get('/delivery/analytics', { params: { from, to } })).data;
  }

  async function loadDesign() {
    const month = getOrderStatsMonthValue();
    const [statsResponse, ordersResponse] = await Promise.all([
      api.get('/orders/stats', { params: { month } }),
      api.get('/orders', { params: { limit: 100, offset: 0 } }),
    ]);
    const orders = ordersResponse.data.orders ?? [];
    const now = Date.now();
    const overdue = orders.filter((order: any) => {
      if (!order.deadline || ['approved', 'cancelled'].includes(order.status)) return false;
      return new Date(order.deadline).getTime() < now;
    });
    return { stats: statsResponse.data, orders, overdue };
  }

  async function loadHr() {
    const { month, today } = monthRange();
    const results = await Promise.allSettled([
      api.get('/attendance', { params: { month } }),
      api.get('/leave', { params: { month } }),
      api.get('/payroll', { params: { period: month } }),
    ]);
    if (results.every((result) => result.status === 'rejected')) {
      throw (results[0] as PromiseRejectedResult).reason;
    }
    const attendance = results[0].status === 'fulfilled' ? results[0].value.data.records ?? [] : [];
    const leaves = results[1].status === 'fulfilled' ? results[1].value.data.records ?? [] : [];
    const payroll = results[2].status === 'fulfilled' ? results[2].value.data.rows ?? [] : [];
    return { attendance, leaves, payroll, today };
  }

  async function refresh() {
    refreshing.value = true;
    await Promise.all([
      loadPart('messages', loadMessages),
      loadPart('delivery', loadDelivery),
      loadPart('design', loadDesign),
      loadPart('hr', loadHr),
    ]);
    lastUpdated.value = new Date();
    refreshing.value = false;
  }

  const alerts = computed<ExecutiveAlert[]>(() => {
    const items: ExecutiveAlert[] = [];
    const me = raw.messages.me;
    const unreplied = number(me?.kpi?.unreplied?.public) + number(me?.kpi?.unreplied?.private);
    if (unreplied > 0) items.push({ key: 'unreplied', title: `${count(unreplied)} khách chưa được phản hồi`, detail: 'Ưu tiên xử lý hội thoại đang chờ', icon: 'mdi-message-alert-outline', route: '/chat', level: unreplied >= 10 ? 'critical' : 'attention' });
    if (number(raw.delivery.overdue) > 0) items.push({ key: 'delivery-overdue', title: `${count(raw.delivery.overdue)} đơn giao vận quá hạn`, detail: 'Đơn chưa hoàn tất thanh toán sau 4 ngày', icon: 'mdi-truck-alert-outline', route: '/pancake-orders', level: 'critical' });
    if (raw.design.overdue?.length) items.push({ key: 'design-overdue', title: `${count(raw.design.overdue.length)} đơn thiết kế quá hạn`, detail: 'Đã vượt deadline nhưng chưa duyệt', icon: 'mdi-palette-outline', route: '/orders', level: 'critical' });
    const pendingLeaves = raw.hr.leaves?.filter((leave: any) => leave.status === 'pending').length ?? 0;
    if (pendingLeaves > 0) items.push({ key: 'leave-pending', title: `${count(pendingLeaves)} đơn nghỉ phép chờ duyệt`, detail: 'Nhân sự đang chờ phản hồi', icon: 'mdi-calendar-question-outline', route: '/salary', level: 'attention' });
    return items;
  });

  const modules = computed<ExecutiveModule[]>(() => {
    const me = raw.messages.me;
    const system = raw.messages.system;
    const unreplied = number(me?.kpi?.unreplied?.public) + number(me?.kpi?.unreplied?.private);
    const messageHealth = states.messages.error ? 'unavailable' : health(unreplied, 1, 10);
    const nickIssues = number(system?.orgKpi?.nickHealth?.banned) + number(system?.orgKpi?.nickHealth?.offline);

    const deliveryTotal = number(raw.delivery.totalOrders);
    const delivered = number(raw.delivery.byStatus?.delivered?.count);
    const deliveryRate = deliveryTotal ? Math.round((delivered / deliveryTotal) * 100) : 0;
    const deliveryHealth = states.delivery.error ? 'unavailable' : health(number(raw.delivery.overdue), 1, 5);

    const designStats = raw.design.stats ?? {};
    const activeDesign = number(designStats.byStatus?.demo) + number(designStats.byStatus?.designing);
    const newDesign = Array.isArray(designStats.daily) ? designStats.daily.reduce((sum: number, value: number) => sum + number(value), 0) : 0;
    const designHealth = states.design.error ? 'unavailable' : health(raw.design.overdue?.length ?? 0, 1, 5);

    const todayAttendance = raw.hr.attendance?.filter((record: any) => record.date === raw.hr.today) ?? [];
    const present = new Set(todayAttendance.map((record: any) => record.userId)).size;
    const people = raw.hr.payroll?.length ?? 0;
    const late = todayAttendance.filter((record: any) => record.status === 'late').length;
    const approvedLeave = raw.hr.leaves?.filter((leave: any) => leave.status === 'approved' && leave.startDate <= raw.hr.today && leave.endDate >= raw.hr.today).length ?? 0;
    const pendingLeave = raw.hr.leaves?.filter((leave: any) => leave.status === 'pending').length ?? 0;
    const payroll = raw.hr.payroll?.reduce((sum: number, row: any) => sum + number(row.record?.netSalary), 0) ?? 0;
    const hrHealth = states.hr.error ? 'unavailable' : health(late + pendingLeave, 1, 6);

    return [
      {
        key: 'messages', title: 'Tin nhắn', subtitle: 'Khách hàng & phản hồi', icon: 'mdi-message-text-outline', route: '/chat', tone: 'blue',
        health: messageHealth, healthLabel: healthLabel(messageHealth), primaryLabel: 'Khách chưa phản hồi', primaryValue: count(unreplied), primaryNote: unreplied ? 'Cần trả lời ngay' : 'Hộp thư đã được xử lý',
        metrics: [
          { label: 'Tỷ lệ phản hồi', value: `${count(me?.interactionToday?.replyRate)}%`, tone: 'green' },
          { label: 'Lead mới hôm nay', value: count(me?.interactionToday?.newLeads) },
          { label: 'Khách đình trệ', value: count(number(me?.kpi?.dormantContacts?.public) + number(me?.kpi?.dormantContacts?.private)), tone: 'amber' },
          { label: 'Nick cần chú ý', value: count(nickIssues), tone: nickIssues ? 'red' : 'green' },
        ],
        loading: states.messages.loading, error: states.messages.error,
      },
      {
        key: 'delivery', title: 'Giao vận', subtitle: 'Đơn hàng & vận chuyển', icon: 'mdi-truck-delivery-outline', route: '/pancake-orders', tone: 'green',
        health: deliveryHealth, healthLabel: healthLabel(deliveryHealth), primaryLabel: 'Đơn trong tháng', primaryValue: count(deliveryTotal), primaryNote: `${count(raw.delivery.byStatus?.shipping?.count)} đơn đang giao`,
        metrics: [
          { label: 'Đã giao', value: count(delivered), tone: 'green' },
          { label: 'Tỷ lệ hoàn tất', value: `${deliveryRate}%` },
          { label: 'Quá hạn', value: count(raw.delivery.overdue), tone: number(raw.delivery.overdue) ? 'red' : 'green' },
          { label: 'Còn phải thu', value: compactMoney(raw.delivery.outstanding), tone: 'amber' },
        ],
        progress: deliveryRate, loading: states.delivery.loading, error: states.delivery.error,
      },
      {
        key: 'design', title: 'Đơn thiết kế', subtitle: 'Tiếp nhận & sản xuất file', icon: 'mdi-palette-outline', route: '/orders', tone: 'violet',
        health: designHealth, healthLabel: healthLabel(designHealth), primaryLabel: 'Đơn đang xử lý', primaryValue: count(activeDesign), primaryNote: `${count(newDesign)} đơn mới trong tháng`,
        metrics: [
          { label: 'Chờ tiếp nhận', value: count(designStats.byStatus?.demo), tone: 'amber' },
          { label: 'Đang thiết kế', value: count(designStats.byStatus?.designing) },
          { label: 'Đã duyệt', value: count(designStats.byStatus?.approved), tone: 'green' },
          { label: 'Quá deadline', value: count(raw.design.overdue?.length), tone: raw.design.overdue?.length ? 'red' : 'green' },
        ],
        loading: states.design.loading, error: states.design.error,
      },
      {
        key: 'hr', title: 'Nhân sự', subtitle: 'Chấm công & tiền lương', icon: 'mdi-calendar-account-outline', route: '/salary', tone: 'amber',
        health: hrHealth, healthLabel: healthLabel(hrHealth), primaryLabel: 'Có mặt hôm nay', primaryValue: people ? `${count(present)}/${count(people)}` : count(present), primaryNote: `${count(approvedLeave)} nhân sự nghỉ phép`,
        metrics: [
          { label: 'Đi trễ hôm nay', value: count(late), tone: late ? 'red' : 'green' },
          { label: 'Đơn phép chờ duyệt', value: count(pendingLeave), tone: pendingLeave ? 'amber' : 'green' },
          { label: 'Tổng nhân sự', value: count(people) },
          { label: 'Quỹ lương tháng', value: compactMoney(payroll) },
        ],
        loading: states.hr.loading, error: states.hr.error,
      },
    ];
  });

  const kpis = computed<ExecutiveKpi[]>(() => {
    const designStats = raw.design.stats ?? {};
    const newOrders = Array.isArray(designStats.daily) ? designStats.daily.reduce((sum: number, value: number) => sum + number(value), 0) : 0;
    const activeOrders = number(designStats.byStatus?.demo) + number(designStats.byStatus?.designing);
    const deliveryTotal = number(raw.delivery.totalOrders);
    const delivered = number(raw.delivery.byStatus?.delivered?.count);
    const completion = deliveryTotal ? Math.round((delivered / deliveryTotal) * 100) : 0;
    return [
      { key: 'revenue', label: 'Doanh thu tháng', value: compactMoney(raw.delivery.revenue), note: `${count(deliveryTotal)} đơn giao vận`, icon: 'mdi-chart-line', tone: 'blue', route: '/pancake-orders' },
      { key: 'collected', label: 'Tiền thực thu', value: compactMoney(raw.delivery.paidRevenue), note: 'Theo đơn đã thanh toán/cọc', icon: 'mdi-cash-check', tone: 'green', route: '/pancake-orders' },
      { key: 'new-orders', label: 'Đơn thiết kế mới', value: count(newOrders), note: 'Từ đầu tháng đến nay', icon: 'mdi-file-plus-outline', tone: 'violet', route: '/orders' },
      { key: 'active-orders', label: 'Đơn đang xử lý', value: count(activeOrders), note: 'Chờ nhận và đang thiết kế', icon: 'mdi-progress-clock', tone: 'amber', route: '/orders' },
      { key: 'delivery-rate', label: 'Tỷ lệ đã giao', value: `${completion}%`, note: `${count(delivered)}/${count(deliveryTotal)} đơn`, icon: 'mdi-truck-check-outline', tone: 'green', route: '/pancake-orders' },
      { key: 'alerts', label: 'Cảnh báo cần xử lý', value: count(alerts.value.length), note: alerts.value.length ? 'Có việc cần anh chú ý' : 'Hệ thống đang ổn định', icon: 'mdi-bell-alert-outline', tone: alerts.value.length ? 'red' : 'slate', route: '/' },
    ];
  });

  onMounted(() => {
    void refresh();
  });

  return { kpis, modules, alerts, lastUpdated, refreshing, refresh };
}
