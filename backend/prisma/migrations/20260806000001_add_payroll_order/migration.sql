-- AddColumn: payrollOrder on users for stable payroll sort
ALTER TABLE "users" ADD COLUMN "payroll_order" INTEGER NOT NULL DEFAULT 999;
