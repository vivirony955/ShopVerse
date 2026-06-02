-- DropIndex
DROP INDEX "PincodeServiceability_pincode_key";

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'US';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "PincodeServiceability" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'US';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT;

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'US';

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "country" TEXT NOT NULL DEFAULT 'US',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "region" TEXT NOT NULL DEFAULT 'us',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PincodeServiceability_country_pincode_key" ON "PincodeServiceability"("country", "pincode");

