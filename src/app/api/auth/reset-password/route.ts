import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { digestToken } from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordExpiry, passwordPolicyError } from "@/lib/auth/policy";
import { publicOrigin } from "@/lib/http";
import { sendAuthMail } from "@/lib/auth/mail";
export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const invalid = () =>
    NextResponse.redirect(new URL("/reset-password?error=1", publicOrigin(request)), 303);
  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    !(await allowAuthAttempt("reset-token", digestToken(token), 8)) ||
    passwordPolicyError(password) ||
    password !== form.get("confirmPassword")
  )
    return invalid();
  const hash = hashPassword(password);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.securityToken.findUnique({
        where: { tokenHash: digestToken(token) },
        include: { user: true },
      });
      if (
        !record ||
        record.kind !== "reset" ||
        record.expiresAt < new Date() ||
        !record.user.active ||
        !record.user.emailVerifiedAt ||
        record.target !== record.user.email ||
        verifyPassword(password, record.user.passwordHash)
      )
        throw new Error("Invalid token");
      const consumed = await tx.securityToken.deleteMany({ where: { id: record.id } });
      if (consumed.count !== 1) throw new Error("Used token");
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: hash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          passwordExpiresAt: passwordExpiry(),
        },
      });
      await tx.securityToken.deleteMany({ where: { userId: record.userId } });
      await tx.session.deleteMany({ where: { userId: record.userId } });
      await tx.auditEvent.create({
        data: {
          actorId: record.userId,
          action: "account.password_reset",
          entityType: "User",
          entityId: record.userId,
          metadata: {},
        },
      });
      return { email: record.user.email, id: record.id };
    });
    await sendAuthMail(
      result.email,
      "Santa · Şifreniz değiştirildi",
      "Şifreniz değiştirildi ve eski oturumlarınız kapatıldı. Bu işlemi siz yapmadıysanız klinik yöneticinizle iletişime geçin.",
      `reset-notice-${result.id}`,
    ).catch(() => console.error("Password change notification failed"));
    return NextResponse.redirect(new URL("/login?reset=1", publicOrigin(request)), 303);
  } catch {
    return invalid();
  }
}
