-- CreateTable
CREATE TABLE "SimulationThread" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "turns" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulationThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SimulationThread_adminUserId_key" ON "SimulationThread"("adminUserId");

-- AddForeignKey
ALTER TABLE "SimulationThread" ADD CONSTRAINT "SimulationThread_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
