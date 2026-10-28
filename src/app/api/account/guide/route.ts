import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
export async function POST() {
  const user = await requireUser();
  if (!user.onboardingCompletedAt) return NextResponse.json({ show: false });
  const show = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guide:${user.id}`}))`;
    const seen = await tx.auditEvent.findFirst({
      where: {
        actorId: user.id,
        action: { in: ["account.guide_shown", "account.guide_initialized"] },
      },
      select: { id: true },
    });
    if (seen) return false;
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action: "account.guide_shown",
        entityType: "User",
        entityId: user.id,
        metadata: {},
      },
    });
    return true;
  });
  return NextResponse.json({ show });
}
