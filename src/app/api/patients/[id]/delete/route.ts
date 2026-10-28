import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getCalendar } from "@/lib/queue/ports";
import { erasePatientData } from "@/lib/patients/privacy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return NextResponse.json(
      { error: "Müşteri silme işlemini yalnızca yönetici yapabilir." },
      { status: 403 },
    );
  const { id } = await context.params;
  const form = await request.formData();
  if (form.get("confirmation") !== "SİL" || form.get("reviewed") !== "yes")
    return NextResponse.json(
      { error: "Silme kapsamını kontrol edip SİL yazın." },
      { status: 400 },
    );
  if (!(await prisma.patient.findUnique({ where: { id }, select: { id: true } })))
    return NextResponse.json({ error: "Müşteri kaydı bulunamadı." }, { status: 404 });
  try {
    await erasePatientData(prisma, getCalendar(), id, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "Ortak telefon kaydı var; diğer kişinin verilerini korumak için manuel inceleme gerekli.",
      "Önce aktif randevuları ve bekleyen talepleri sonuçlandırın.",
      "30 üzeri takvim kaydı için kademeli çalışan incelemesi gerekli.",
    ];
    return NextResponse.json(
      {
        error: known.includes(message)
          ? message
          : "Silme işlemi tamamlanamadı. Takvim bağlantısını ve kaydı kontrol ederek yeniden deneyin.",
      },
      { status: 409 },
    );
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
