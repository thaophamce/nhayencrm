-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "has_design_fee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_outsource" BOOLEAN NOT NULL DEFAULT false;
