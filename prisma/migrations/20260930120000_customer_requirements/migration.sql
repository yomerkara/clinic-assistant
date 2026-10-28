ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'PRICE_REQUEST';
ALTER TYPE "ActionType" ADD VALUE IF NOT EXISTS 'INVOICE_REQUEST';

ALTER TABLE "Appointment"
ADD COLUMN "reminderSentAt" TIMESTAMP(3);

UPDATE "TherapistProfile"
SET "active" = false
WHERE "id" = 'therapist_mustafa';
