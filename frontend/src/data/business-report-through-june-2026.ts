export type BusinessMonthData = {
  revenue: number;
  orderCount: number;
  expenses: Record<string, number>;
  customerCare: Record<string, number>;
};

// Snapshot từ hệ thống Giao vận Nhà Yến. Không thêm dữ liệu sau 30/06/2026.
export const BUSINESS_REPORT_MAX_MONTH = '2026-06';

export const BUSINESS_REPORT_MONTHS: Record<string, BusinessMonthData> = {
  '2026-01': {
    revenue: 1738233000, orderCount: 1166,
    expenses: { 'hoc-mon': 40000000, 'da-nang': 917264000, 'tan-phu': 81676000, 'quang-cao-fb': 60573000, luong: 161957000, 'viettel-post': 37887000, dien: 4000000, 'van-phong': 14000000, 'ke-toan-thue': 11000000 },
    customerCare: { so_dien_thoai_moi: 1374, khach_cu_nhan_tin: 2223, khach_hang_moi: 4339, don_hoan_tat: 1166, chi_phi_1_khach: 51949, trung_binh_1_don: 1138385, tong_ngan_sach: 60573000, chi_phi_1_tin_nhan: 13960, tong_don_hang: 1166, chot_in: 1166 },
  },
  '2026-02': {
    revenue: 494454000, orderCount: 513,
    expenses: { 'hoc-mon': 0, 'da-nang': 1082972340, 'tan-phu': 25340000, 'quang-cao-fb': 31264019, luong: 66264000, 'viettel-post': 12796484, dien: 3500000, 'van-phong': 14000000, 'ke-toan-thue': 11000000 },
    customerCare: { so_dien_thoai_moi: 1368, khach_cu_nhan_tin: 1564, khach_hang_moi: 3552, don_hoan_tat: 513, chi_phi_1_khach: 60943, trung_binh_1_don: 963847, tong_ngan_sach: 31264019, chi_phi_1_tin_nhan: 8801, tong_don_hang: 513, chot_in: 513 },
  },
  '2026-03': {
    revenue: 1562698000, orderCount: 1036,
    expenses: { 'hoc-mon': 33535000, 'da-nang': 807855000, 'tan-phu': 52754000, 'quang-cao-fb': 72711600, luong: 131926000, 'viettel-post': 59144980, dien: 3500000, 'van-phong': 14000000, 'ke-toan-thue': 11000000 },
    customerCare: { so_dien_thoai_moi: 2533, khach_cu_nhan_tin: 2669, khach_hang_moi: 7242, don_hoan_tat: 1036, chi_phi_1_khach: 70184, trung_binh_1_don: 1508395, tong_ngan_sach: 72711600, chi_phi_1_tin_nhan: 10040, tong_don_hang: 1036, chot_in: 1036 },
  },
  '2026-04': {
    revenue: 1086000000, orderCount: 580,
    expenses: { 'hoc-mon': 19216000, 'da-nang': 533612500, 'tan-phu': 37346000, 'quang-cao-fb': 47673709, luong: 101034000, 'viettel-post': 1197940, dien: 3500000, 'van-phong': 14200000, 'ke-toan-thue': 14040000 },
    customerCare: { tong_don_hang: 580, chot_in: 580 },
  },
  '2026-05': {
    revenue: 820416000, orderCount: 460,
    expenses: { 'hoc-mon': 19387000, 'da-nang': 358345250, 'tan-phu': 44096000, 'quang-cao-fb': 47673000, luong: 110232000, 'viettel-post': 0, dien: 3300000, 'van-phong': 14000000, 'ke-toan-thue': 14040000 },
    customerCare: { so_dien_thoai_moi: 1505, khach_cu_nhan_tin: 2040, khach_hang_moi: 4516, don_hoan_tat: 460, chi_phi_1_khach: 103636, trung_binh_1_don: 1783513, tong_ngan_sach: 47673000, chi_phi_1_tin_nhan: 10500, tong_don_hang: 460, chot_in: 460, dang_thiet_ke: 6 },
  },
  '2026-06': {
    revenue: 1077316000, orderCount: 700,
    expenses: { 'hoc-mon': 20051000, 'da-nang': 0, 'tan-phu': 42026000, 'quang-cao-fb': 46926000, luong: 112987000, 'viettel-post': 0, dien: 3200000, 'van-phong': 14000000, 'ke-toan-thue': 14040000 },
    customerCare: { so_dien_thoai_moi: 2062, khach_cu_nhan_tin: 1367, khach_hang_moi: 5652, don_hoan_tat: 705, chi_phi_1_khach: 66561, trung_binh_1_don: 1539023, tong_ngan_sach: 46926000, chi_phi_1_tin_nhan: 8302 },
  },
};
