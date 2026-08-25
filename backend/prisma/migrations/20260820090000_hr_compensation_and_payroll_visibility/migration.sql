-- Phase HR compensation & payroll visibility 2026-08-20
-- 1. hr_employee_compensation: lich su luong co ban theo user (effective_from/effective_to).
-- 2. users.is_payroll_hidden: an user khoi Bang luong + Phieu luong cua toi.

CREATE TABLE "hr_employee_compensation" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "effective_from" TEXT NOT NULL,
    "effective_to" TEXT,
    "base_salary" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_employee_compensation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hr_employee_compensation_org_user_window_key"
    ON "hr_employee_compensation"("org_id", "user_id", "effective_from");

CREATE INDEX "hr_employee_compensation_org_user_idx"
    ON "hr_employee_compensation"("org_id", "user_id");

ALTER TABLE "hr_employee_compensation"
    ADD CONSTRAINT "hr_employee_compensation_org_id_fkey" FOREIGN KEY ("org_id")
    REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hr_employee_compensation"
    ADD CONSTRAINT "hr_employee_compensation_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hr_employee_compensation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_employee_compensation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "hr_employee_compensation";
CREATE POLICY tenant_isolation ON "hr_employee_compensation"
    USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "users" ADD COLUMN "is_payroll_hidden" BOOLEAN NOT NULL DEFAULT false;
