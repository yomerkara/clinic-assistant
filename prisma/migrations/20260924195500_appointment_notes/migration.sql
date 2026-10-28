CREATE TABLE "AppointmentNote" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "messageId" TEXT,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentNote_messageId_key" ON "AppointmentNote"("messageId");
CREATE INDEX "AppointmentNote_appointmentId_createdAt_idx" ON "AppointmentNote"("appointmentId", "createdAt");

ALTER TABLE "AppointmentNote"
ADD CONSTRAINT "AppointmentNote_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentNote"
ADD CONSTRAINT "AppointmentNote_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
