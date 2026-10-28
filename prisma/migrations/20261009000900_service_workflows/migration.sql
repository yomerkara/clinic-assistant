ALTER TABLE "Appointment" ADD COLUMN "sessionMode" TEXT NOT NULL DEFAULT 'IN_PERSON', ADD COLUMN "meetingUrl" TEXT, ADD COLUMN "meetingSentAt" TIMESTAMP(3), ADD COLUMN "completedAutomaticallyAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "sessionMode" TEXT NOT NULL DEFAULT 'IN_PERSON';
ALTER TABLE "ServiceRequest" ADD COLUMN "workflow" JSONB, ADD COLUMN "notificationSentAt" TIMESTAMP(3);
CREATE INDEX "Appointment_online_due_idx" ON "Appointment"("sessionMode", "startAt", "meetingSentAt");
