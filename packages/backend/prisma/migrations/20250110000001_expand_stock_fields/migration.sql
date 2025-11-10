-- AlterTable: Add comprehensive stock fields for industrial work
ALTER TABLE "Stock"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buyingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "minQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "brand" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "model" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "partNumber" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "sku" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "specifications" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "voltage" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "power" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "material" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "size" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "weight" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "color" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "supplier" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "supplierCode" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "warranty" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

-- Rename unitPrice to match old field (backward compatibility)
-- We keep unitPrice but it will be deprecated in favor of sellingPrice
-- Copy existing unitPrice to sellingPrice
UPDATE "Stock" SET "sellingPrice" = "unitPrice" WHERE "sellingPrice" = 0;

-- CreateIndex
CREATE INDEX "Stock_category_idx" ON "Stock"("category");

-- CreateIndex
CREATE INDEX "Stock_partNumber_idx" ON "Stock"("partNumber");

-- CreateIndex
CREATE INDEX "Stock_sku_idx" ON "Stock"("sku");
