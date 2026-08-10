// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * seed-default-groups.ts — Seed default permission groups (system, is_system=true).
 * Admin + Sale + Designer.
 *
 * Idempotent: chạy nhiều lần OK, chỉ tạo nếu group chưa tồn tại trong org.
 * Gọi từ migration script D13 hoặc admin endpoint.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { DEFAULT_PERMISSION_GROUPS } from './permission-types.js';

export interface SeedResult {
  created: number;
  existing: number;
  groups: Array<{ id: string; name: string; isSystem: boolean }>;
}

export async function seedDefaultPermissionGroups(orgId: string): Promise<SeedResult> {
  const result: SeedResult = { created: 0, existing: 0, groups: [] };

  await prisma.permissionGroup.updateMany({
    where: { orgId, name: 'Designer Order Full Access' },
    data: { name: 'Designer', isSystem: true },
  });

  for (const tmpl of DEFAULT_PERMISSION_GROUPS) {
    // Idempotent: check by (orgId, name, isSystem)
    const existing = await prisma.permissionGroup.findFirst({
      where: { orgId, name: tmpl.name, isSystem: true },
      select: { id: true, name: true, isSystem: true },
    });
    if (existing) {
      result.existing++;
      result.groups.push(existing);
      continue;
    }

    const created = await prisma.permissionGroup.create({
      data: {
        id: randomUUID(),
        orgId,
        name: tmpl.name,
        isSystem: tmpl.isSystem,
        grants: tmpl.grants as object,
      },
      select: { id: true, name: true, isSystem: true },
    });
    result.created++;
    result.groups.push(created);
  }

  return result;
}

/**
 * Sync grants của 2 system groups (Admin + Sale) với DEFAULT_PERMISSION_GROUPS.
 * Idempotent — chạy lại không ảnh hưởng nếu grants đã đúng.
 */
export async function syncDefaultPermissionGroups(orgId: string): Promise<{
  synced: number;
  names: string[];
}> {
  await seedDefaultPermissionGroups(orgId);
  await seedDefaultDepartments(orgId);
  let synced = 0;
  const names: string[] = [];

  for (const tmpl of DEFAULT_PERMISSION_GROUPS) {
    const result = await prisma.permissionGroup.updateMany({
      where: { orgId, name: tmpl.name, isSystem: true },
      data: { grants: tmpl.grants as object },
    });
    if (result.count > 0) {
      synced += result.count;
      names.push(tmpl.name);
    }
  }

  return { synced, names };
}

/** Bảo đảm hai phòng ban nghiệp vụ chuẩn tồn tại cho popup tạo nhân viên. */
export async function seedDefaultDepartments(orgId: string): Promise<void> {
  for (const [displayOrder, name] of ['Sale', 'Designer'].entries()) {
    const existing = await prisma.department.findFirst({
      where: { orgId, name, parentId: null, archivedAt: null },
      select: { id: true },
    });
    if (existing) continue;
    const id = randomUUID();
    await prisma.department.create({
      data: { id, orgId, name, parentId: null, path: `/${id}/`, depth: 0, displayOrder },
    });
  }
}

/**
 * Map legacy `users.role` → permission_group_id mới.
 * Dual-read window: code mới đọc cả 2, sau 2 tuần drop legacy role.
 */
export async function migrateLegacyUsersToPermissionGroups(orgId: string): Promise<{
  ownerCount: number;
  adminCount: number;
  memberCount: number;
}> {
  // Lấy ID của 2 group system mapping legacy role (2026-07-14: owner/admin → Admin, member → Sale)
  const [adminGrp, saleGrp] = await Promise.all([
    prisma.permissionGroup.findFirst({ where: { orgId, name: 'Admin', isSystem: true }, select: { id: true } }),
    prisma.permissionGroup.findFirst({ where: { orgId, name: 'Sale', isSystem: true }, select: { id: true } }),
  ]);
  if (!adminGrp || !saleGrp) {
    throw new Error('Default groups chưa seed — chạy seedDefaultPermissionGroups() trước');
  }

  // Migrate: owner → Admin, admin (role hệ thống) → Admin, member → Sale
  // Chỉ update user chưa có permission_group_id (idempotent)
  const [ownerRes, adminRes, memberRes] = await Promise.all([
    prisma.user.updateMany({
      where: { orgId, role: 'owner', permissionGroupId: null },
      data: { permissionGroupId: adminGrp.id },
    }),
    prisma.user.updateMany({
      where: { orgId, role: 'admin', permissionGroupId: null },
      data: { permissionGroupId: adminGrp.id },
    }),
    prisma.user.updateMany({
      where: { orgId, role: 'member', permissionGroupId: null },
      data: { permissionGroupId: saleGrp.id },
    }),
  ]);

  return {
    ownerCount: ownerRes.count,
    adminCount: adminRes.count,
    memberCount: memberRes.count,
  };
}
