/*
  Warnings:

  - Added the required column `jobType` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `location` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `salary` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Job` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Job` ADD COLUMN `deadline` DATETIME(3) NULL,
    ADD COLUMN `jobType` ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP') NOT NULL,
    ADD COLUMN `location` VARCHAR(191) NOT NULL,
    ADD COLUMN `maxApplicants` INTEGER NULL DEFAULT 50,
    ADD COLUMN `salary` INTEGER NOT NULL,
    ADD COLUMN `status` ENUM('UNPAID', 'OPEN', 'CLOSED') NOT NULL DEFAULT 'UNPAID',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `paymentUrl` VARCHAR(191) NULL,
    ADD COLUMN `snapToken` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Quest` ADD COLUMN `deadline` DATETIME(3) NULL,
    ADD COLUMN `maxSubmissions` INTEGER NULL DEFAULT 10;

-- AlterTable
ALTER TABLE `QuestSubmission` ADD COLUMN `feedback` VARCHAR(191) NULL,
    ADD COLUMN `fileUrl` VARCHAR(191) NULL,
    ADD COLUMN `rating` INTEGER NULL;

-- CreateTable
CREATE TABLE `JobApplication` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jobId` INTEGER NOT NULL,
    `workerId` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'REVIEWING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `resumeUrl` VARCHAR(191) NULL,
    `appliedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `JobApplication_jobId_workerId_key`(`jobId`, `workerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `JobApplication` ADD CONSTRAINT `JobApplication_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `Job`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobApplication` ADD CONSTRAINT `JobApplication_workerId_fkey` FOREIGN KEY (`workerId`) REFERENCES `Worker`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
