-- AlterTable
ALTER TABLE `Employer` ADD COLUMN `onetimeQuota` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `OneTimeQuota` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT false;
