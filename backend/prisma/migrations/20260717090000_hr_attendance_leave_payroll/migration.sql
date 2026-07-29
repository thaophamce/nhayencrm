-- Phase HR 2026-07-17 — Chấm công / Nghỉ phép / Lương (port từ nha-yen-webapp).
-- 3 bảng org-scoped mới + cột hr_config trên organizations.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "hr_config" JSONB;

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "checkin_time" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_reason" TEXT,
    "client_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_records" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "base_salary" INTEGER NOT NULL DEFAULT 0,
    "work_days" INTEGER NOT NULL DEFAULT 0,
    "working_days" INTEGER NOT NULL DEFAULT 26,
    "overtime_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtime_sunday_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kpi_amount" INTEGER NOT NULL DEFAULT 0,
    "allowance_amount" INTEGER NOT NULL DEFAULT 0,
    "advance_amount" INTEGER NOT NULL DEFAULT 0,
    "fill_order_amount" INTEGER NOT NULL DEFAULT 0,
    "has_insurance" BOOLEAN NOT NULL DEFAULT false,
    "overtime_amount" INTEGER NOT NULL DEFAULT 0,
    "thanh_tien" INTEGER NOT NULL DEFAULT 0,
    "total_salary" INTEGER NOT NULL DEFAULT 0,
    "net_salary" INTEGER NOT NULL DEFAULT 0,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_records_org_id_date_idx" ON "attendance_records"("org_id", "date");

-- CreateIndex
CREATE INDEX "attendance_records_org_id_user_id_idx" ON "attendance_records"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_org_id_user_id_date_shift_key" ON "attendance_records"("org_id", "user_id", "date", "shift");

-- CreateIndex
CREATE INDEX "leave_requests_org_id_user_id_idx" ON "leave_requests"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "leave_requests_org_id_status_idx" ON "leave_requests"("org_id", "status");

-- CreateIndex
CREATE INDEX "salary_records_org_id_period_idx" ON "salary_records"("org_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "salary_records_org_id_user_id_period_key" ON "salary_records"("org_id", "user_id", "period");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
