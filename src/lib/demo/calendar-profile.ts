import { prisma } from "@/lib/prisma";

/** Only the authenticated demo administrator can expose their own calendar. */
export async function ensureDemoCalendarProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { calendarConnection: { select: { id: true } } },
  });
  if (!user?.active || user.role !== "ADMIN" || !user.calendarConnection) return null;
  return prisma.therapistProfile.upsert({
    where: { userId },
    create: {
      userId,
      displayName: "Yönetici Ömer (test)",
      specialties: [],
      active: true,
    },
    update: {},
  });
}
