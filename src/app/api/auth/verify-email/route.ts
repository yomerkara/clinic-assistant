import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { digestToken } from "@/lib/auth/tokens";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { publicOrigin } from "@/lib/http";
export async function POST(request: Request) {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const destination =
    form.get("returnTo") === "account"
      ? "/settings/account?section=email&"
      : "/onboarding?";
  const go = (value: string) =>
    NextResponse.redirect(new URL(`${destination}${value}`, publicOrigin(request)), 303);
  if (!(await allowAuthAttempt("verify", user.id, 10)) || !/^[a-f0-9]{64}$/.test(token))
    return go("securityError=Geçersiz%20veya%20süresi%20dolmuş%20bağlantı.");
  try {
    await prisma.$transaction(async (tx) => {
      const record = await tx.securityToken.findUnique({
        where: { tokenHash: digestToken(token) },
      });
      if (
        !record ||
        record.kind !== "verify" ||
        record.userId !== user.id ||
        record.expiresAt < new Date() ||
        !record.target
      )
        throw new Error("Invalid token");
      const consumed = await tx.securityToken.deleteMany({ where: { id: record.id } });
      if (consumed.count !== 1) throw new Error("Used token");
      await tx.user.update({
        where: { id: user.id },
        data: { email: record.target, emailVerifiedAt: new Date() },
      });
      await tx.securityToken.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "account.email_verified",
          entityType: "User",
          entityId: user.id,
          metadata: {},
        },
      });
    });
    return go("security=verified");
  } catch {
    return go(
      "securityError=Bağlantı%20kullanılamadı.%20Yeni%20bir%20doğrulama%20e-postası%20isteyin.",
    );
  }
}
