// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
//
// set-hr-usernames.ts — đổi email đăng nhập của 6 nhân sự sang username ngắn
// (linh/vy/theanh/khang/binh/rola) + reset mật khẩu về 123456.
// Nhắm theo email HIỆN TẠI để định danh đúng người; idempotent (chạy lại an toàn).
//
// Chạy:  npx tsx --env-file=.env prisma/seeds/set-hr-usernames.ts
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PASSWORD = '123456';

// currentEmail = email đang có trong DB; username = login mới (email mới).
const MAP: Array<{ currentEmail: string; username: string }> = [
  { currentEmail: 'khanhlinh@nhayen.com', username: 'linh' },
  { currentEmail: 'hoangvy@nhayen.com', username: 'vy' },
  { currentEmail: 'theanh@nhayen.com', username: 'theanh' },
  { currentEmail: 'minhkhang@nhayen.com', username: 'khang' },
  { currentEmail: 'thienbinh@nhayen.com', username: 'binh' },
  { currentEmail: 'nguyenrola@nhayen.com', username: 'rola' },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  // passwordChangedAt != null  → KHÔNG bắt đổi mật khẩu ở lần đăng nhập đầu.
  const passwordChangedAt = new Date();

  for (const { currentEmail, username } of MAP) {
    // Tìm theo email hiện tại; nếu đã đổi rồi (chạy lần 2) thì tìm theo username.
    const user =
      (await prisma.user.findUnique({ where: { email: currentEmail } })) ??
      (await prisma.user.findUnique({ where: { email: username } }));

    if (!user) {
      console.log(`✗ BỎ QUA: không thấy user ${currentEmail} (cũng không có ${username})`);
      continue;
    }

    // Chặn nếu username đã bị NGƯỜI KHÁC chiếm.
    const clash = await prisma.user.findUnique({ where: { email: username } });
    if (clash && clash.id !== user.id) {
      console.log(`✗ BỎ QUA: username "${username}" đã thuộc user khác (${clash.fullName})`);
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email: username, passwordHash, passwordChangedAt },
    });
    console.log(`✓ ${user.fullName.padEnd(22)} | login: ${username.padEnd(8)} | mật khẩu: ${PASSWORD}`);
  }
}

main()
  .then(() => console.log('\nHoàn tất. Đăng nhập: username + 123456'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
