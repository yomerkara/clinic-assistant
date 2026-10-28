ALTER TABLE "AppointmentNote" ADD COLUMN "calendarSyncedAt" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "pendingAppointmentNote" JSONB;
ALTER TABLE "Conversation" ADD COLUMN "bookingParty" JSONB;
