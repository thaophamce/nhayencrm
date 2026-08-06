// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * permission-types.ts — Resource × Action matrix định nghĩa
 *
 * Reference: GetflyCRM screenshot (matrix 7 cột × 15 resource).
 * Lock 2026-05-21 trong design doc thanh-rbac-m2-design-20260521.md.
 */

// 5 action columns. 'approve'/'pay' (Getfly) đã gỡ 2026-06-20: không có quy trình
// duyệt/thanh toán trong Nhà Yến CRM nên 2 cột đó chỉ là ô tick vô tác dụng.
export const ACTIONS = [
  'access',       // Truy cập
  'create',       // Thêm mới
  'edit',         // Chỉnh sửa
  'delete',       // Xóa
  'view_all',     // Xem tất cả — KEY FLAG bypass dept scope
] as const;
export type Action = (typeof ACTIONS)[number];

// 18 resources, GOM THEO NHÓM MÀN HÌNH (2026-06-20) để ma trận phân quyền đọc theo
// menu — admin gán quyền dễ hơn. Thứ tự ở đây = thứ tự cột dọc trong UI ma trận.
export const RESOURCES = [
  // ── Site truy cập (menu chính, chỉ cần access = hiện/ẩn) ──
  'dashboard',          // Trang tổng quan     → /
  'orders',             // Đơn hàng (site)     → /orders
  'orders_salary',      // Tab Lương thiết kế  → /orders (tab, nhạy cảm)
  'delivery',           // Delivery operations -> /pancake-orders
  'delivery_business',  // Báo cáo doanh thu Giao vận -> /pancake-orders?tab=business
  // ── Hệ thống & tổ chức (menu Cài đặt / Phân quyền) ──
  'department',         // Quản lý phòng ban   → /settings/rbac/departments
  'user',               // Quản lý người dùng  → /settings/rbac/users
  'permission_group',   // Quản lý quyền       → /settings/rbac/permission-groups
  'settings',           // Cài đặt chung       → /settings/* (org, crm, channels...)
  'quick_reply',        // Mẫu trả lời nhanh   → /settings/crm/quick-replies
  'audit_log',          // Nhật ký hành động   → /settings/org/audit
  // ── Khách hàng & hội thoại (menu chính) ──
  'contact',            // Khách hàng          → /contacts
  'friend',             // Bạn bè (Zalo)       → /friends
  'conversation',       // Tin nhắn / Hội thoại→ /chat
  'customer_list',      // Tệp khách hàng      → /marketing/lists
  // ── Marketing / Tự động hoá (menu Marketing) ──
  'trigger',            // Mục tiêu / Trigger  → /marketing/triggers
  'sequence',           // Sequence            → /marketing/sequences
  'broadcast',          // Chiến dịch          → /marketing/broadcasts
  'block',              // Message Block       → /marketing/blocks
  'friend_blast',       // Gửi tin bạn bè      → /marketing/friend-blast
  'care_session',       // Phiên chăm sóc      → /marketing/care-sessions
  // ── Kênh & tài nguyên ──
  'zalo_account',       // Nick Zalo           → /settings/channels/zalo
  'media',              // Kho phương tiện     → /media
  'webhook',            // Webhook / API key   → /settings/dev/api
  // ── Báo cáo ──
  'engagement_score',   // Engagement + Score  → /reports
  // ── Nhân sự & Tài chính (Phase HR 2026-07-17) ──
  'attendance',         // Chấm công           → /timekeeping
  'leave',              // Nghỉ phép           → /timekeeping (tab)
  'payroll',            // Lương               → /salary
  'finance',            // Tài chính           → /finance
] as const;
export type Resource = (typeof RESOURCES)[number];

// Mỗi resource declare actions hợp lệ (subset của ACTIONS).
// Vd Engagement không có "create/edit/delete" — chỉ computed.
export const RESOURCE_ACTIONS: Record<Resource, readonly Action[]> = {
  // Site access-only (bật/tắt hiển thị, không có thao tác CRUD riêng):
  dashboard: ['access'],
  orders: ['access', 'create', 'edit', 'delete', 'view_all'],
  orders_salary: ['access'],
  delivery: ['access', 'create', 'edit', 'delete', 'view_all'],
  delivery_business: ['access'],
  department: ['access', 'create', 'edit', 'delete'],
  user: ['access', 'create', 'edit', 'delete'],
  permission_group: ['access', 'create', 'edit', 'delete'],
  conversation: ['access', 'edit', 'delete', 'view_all'],
  contact: ['access', 'create', 'edit', 'delete', 'view_all'],
  friend: ['access', 'create', 'edit', 'delete', 'view_all'],
  customer_list: ['access', 'create', 'edit', 'delete', 'view_all'],
  broadcast: ['access', 'create', 'edit', 'delete', 'view_all'],
  sequence: ['access', 'create', 'edit', 'delete', 'view_all'],
  trigger: ['access', 'create', 'edit', 'delete', 'view_all'],
  block: ['access', 'create', 'edit', 'delete', 'view_all'],
  friend_blast: ['access', 'create', 'edit', 'delete', 'view_all'],
  zalo_account: ['access', 'create', 'edit', 'delete', 'view_all'],
  webhook: ['access', 'create', 'edit', 'delete'],
  engagement_score: ['access', 'view_all'],
  audit_log: ['access', 'view_all'],
  // Nhân sự (Phase HR 2026-07-17):
  //   attendance — access=tự chấm công + xem lịch sử mình; view_all=xem toàn công ty + cấu hình IP/ca.
  //   leave      — access=gửi + xem đơn mình; edit=duyệt/từ chối; view_all=xem mọi đơn.
  //   payroll    — access=xem phiếu lương mình; edit=nhập/override; view_all=xem bảng lương toàn org.
  attendance: ['access', 'view_all'],
  leave: ['access', 'edit', 'view_all'],
  payroll: ['access', 'edit', 'view_all'],
  settings: ['access', 'create', 'edit'],
  quick_reply: ['access', 'create', 'edit', 'delete'],
  // Phiên chăm sóc — access=xem phiên mình, view_all=xem cả org (scope theo dept tree).
  care_session: ['access', 'view_all'],
  media: ['access', 'create', 'edit', 'delete', 'view_all'],
  finance: ['access', 'create', 'edit', 'delete', 'view_all'],
};

// JSON shape lưu trong permission_groups.grants:
//   { "<resource>": { "<action>": boolean } }
// Vd:
//   { "conversation": { "access": true, "view_all": true, "edit": true } }
export type GrantsJson = {
  [R in Resource]?: {
    [A in Action]?: boolean;
  };
};

/**
 * Check 1 action có grant không.
 * Default deny (return false nếu thiếu).
 */
export function hasGrant(grants: GrantsJson, resource: Resource, action: Action): boolean {
  return grants?.[resource]?.[action] === true;
}

/**
 * Validate grants JSON từ user input — strip mọi key không nằm trong whitelist.
 * Tránh injection: grants.adminBackdoor = true sẽ bị strip.
 */
export function sanitizeGrants(input: unknown): GrantsJson {
  if (!input || typeof input !== 'object') return {};
  const result: GrantsJson = {};
  for (const [r, actions] of Object.entries(input as Record<string, unknown>)) {
    if (!RESOURCES.includes(r as Resource)) continue;
    if (!actions || typeof actions !== 'object') continue;
    const validActions = RESOURCE_ACTIONS[r as Resource];
    const cleanActions: Record<string, boolean> = {};
    for (const [a, v] of Object.entries(actions as Record<string, unknown>)) {
      if (!validActions.includes(a as Action)) continue;
      if (typeof v === 'boolean') cleanActions[a] = v;
    }
    if (Object.keys(cleanActions).length > 0) {
      result[r as Resource] = cleanActions as any;
    }
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════
// MENU_TREE — cây bật/tắt hiển thị (site → tab → tab con) cho UI Phân quyền.
// (Redesign 2026-07-20, anh chốt: bảng tick Hiện/Ẩn thay ma trận 5 cột.)
//
//   - key      : resource cần grant `access` để hiện nút. null = luôn hiện (vd Cá nhân).
//   - action   : action cần thay cho 'access' (vd leave.edit cho "Duyệt nghỉ phép").
//   - sensitive: nút nhạy cảm — CHỈ Admin/Manager, non-admin không bao giờ thấy,
//                KHÔNG render ô tick trong cây (bật cứng theo role phía FE/BE).
//   - children : tab con.
// ════════════════════════════════════════════════════════════════════════
export interface MenuNode {
  key: Resource | null;
  action?: Action;
  label: string;
  sensitive?: boolean;
  children?: MenuNode[];
}

export const MENU_TREE: MenuNode[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'conversation', label: 'Tin nhắn' },
  {
    key: 'delivery',
    label: 'Giao vận',
    children: [
      { key: 'delivery', action: 'access', label: 'Tổng quan' },
      { key: 'delivery', action: 'create', label: 'Giao vận' },
      { key: 'delivery', action: 'view_all', label: 'Báo cáo' },
      { key: 'delivery', action: 'edit', label: 'Áo + Ảnh' },
      { key: 'delivery_business', action: 'access', label: 'Doanh thu' },
      { key: 'delivery', action: 'view_all', label: 'Hoạt động gần đây' },
      { key: 'delivery', action: 'access', label: 'Đơn Pancake' },
    ],
  },
  {
    key: 'orders',
    label: 'Đơn thiết kế',
    children: [
      { key: 'orders', action: 'access', label: 'Tổng quan' },
      { key: 'orders', action: 'create', label: 'Đơn hàng' },
      { key: 'orders_salary', action: 'access', label: 'Lương thiết kế' },
      { key: 'orders', action: 'view_all', label: 'Báo cáo' },
    ],
  },
  {
    key: 'attendance',
    label: 'Nhân sự',
    children: [
      { key: 'attendance', action: 'access', label: 'Chấm công' },
      { key: 'leave', action: 'edit', label: 'Duyệt nghỉ phép' },
      { key: 'attendance', action: 'view_all', label: 'Cấu hình chấm công' },
      { key: 'payroll', action: 'view_all', label: 'Bảng lương' },
      { key: 'payroll', action: 'access', label: 'Phiếu lương của tôi' },
    ],
  },
  {
    key: 'finance',
    label: 'Tài chính',
    children: [
      { key: 'finance', action: 'access', label: 'Tổng quan' },
      { key: 'finance', action: 'create', label: 'Quỹ dự phòng' },
      { key: 'finance', action: 'edit', label: 'Quỹ lợi nhuận' },
      { key: 'finance', action: 'delete', label: 'Công nợ' },
      { key: 'finance', action: 'view_all', label: 'Dòng tiền' },
    ],
  },
  {
    key: 'trigger',
    label: 'Marketing',
    children: [
      { key: 'friend_blast', action: 'access', label: 'Gửi tin nhắn bạn bè' },
      { key: 'broadcast', action: 'access', label: 'Gửi tin nhắn nhóm' },
      { key: 'friend_blast', action: 'edit', label: 'Huỷ kết bạn hàng loạt' },
      { key: 'broadcast', action: 'edit', label: 'Rời nhóm hàng loạt' },
    ],
  },
  { key: 'engagement_score', label: 'Báo cáo chung' },
  {
    key: 'settings',
    label: 'Cài đặt',
    children: [
      { key: null, label: 'Cá nhân (luôn mở)' },
      { key: 'user', action: 'access', label: 'Nhân viên & Tài khoản' },
      { key: 'permission_group', action: 'access', label: 'Phân quyền hệ thống' },
      { key: 'zalo_account', action: 'access', label: 'Quản lý Tài khoản Zalo' },
      { key: 'quick_reply', action: 'access', label: 'Mẫu hỗ trợ trả lời nhanh' },
      { key: 'settings', action: 'edit', label: 'Cấu hình hệ thống chung' },
    ],
  },
];


// 2 group anh chốt 2026-07-14: gọn từ 7 group xuống Admin + Sale.
// ════════════════════════════════════════════════════════════════════════

function fullCrud(resource: Resource): GrantsJson[Resource] {
  const actions: any = {};
  for (const a of RESOURCE_ACTIONS[resource]) actions[a] = true;
  return actions;
}

/**
 * Default groups. Migration D13 sẽ tạo các group này với is_system=true.
 * Admin → full mọi resource × mọi action.
 * Sale → thao tác trong scope của mình; zalo_account KHÔNG có create (2026-07-14
 * anh chốt: chặn sale tự tạo nick mới, chỉ admin tạo/gán; reconnect vẫn chạy vì
 * requireAccountManagement xét ownership, độc lập với grant create).
 */
export const DEFAULT_PERMISSION_GROUPS = [
  {
    name: 'Admin',
    isSystem: true,
    grants: Object.fromEntries(
      RESOURCES.map((r) => [r, fullCrud(r)])
    ) as GrantsJson,
  },
  {
    name: 'Sale',
    isSystem: true,
    grants: {
      // Sale CR KH của mình, không Xóa Conversation
      dashboard: { access: true },
      orders: { access: true, edit: true },
      delivery: { access: true, create: true, edit: true, delete: true },
      delivery_business: { access: true },
      conversation: { access: true, edit: true },
      contact: { access: true, create: true, edit: true },
      friend: { access: true, create: true, edit: true },
      customer_list: { access: true },
      broadcast: { access: true },
      sequence: { access: true },
      trigger: { access: true },
      block: { access: true },
      friend_blast: { access: true },
      // 2026-07-14 (anh chốt): sale KHÔNG tự tạo nick mới, chỉ reconnect/dùng nick
      // admin đã gán. Ownership check ở requireAccountManagement vẫn cho phép
      // sale xóa mềm nick CỦA MÌNH (đã có owner) độc lập với grant create này.
      zalo_account: { access: true, delete: true },
      engagement_score: { access: true },
      media: { access: true, create: true, edit: true }, // kho của mình (scope owner) — sale dùng nhiều nhất
      quick_reply: { access: true, create: true, edit: true, delete: true },
      attendance: { access: true },
      leave: { access: true },
      payroll: { access: true },
    } as GrantsJson,
  },
];
