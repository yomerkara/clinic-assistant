import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, issueSession, sessionCookieOptions } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  passwordPolicyError,
  passwordExpiry,
  normalizeUsername,
  validUsername,
} from "@/lib/auth/policy";
import { deliverAccountToken } from "@/lib/auth/tokens";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { publicOrigin } from "@/lib/http";

export async function POST(request: Request) {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  const form = await request.formData();
  const returnTo =
    form.get("returnTo") === "account" ? "/settings/account" : "/onboarding";
  const go = (key: string, value: string) =>
    NextResponse.redirect(
      new URL(`${returnTo}?${key}=${encodeURIComponent(value)}`, publicOrigin(request)),
      303,
    );
  if (!(await allowAuthAttempt("setup", user.id, 8)))
    return go("securityError", "Çok fazla deneme. 15 dakika sonra tekrar deneyin.");
  const username = normalizeUsername(String(form.get("username") ?? ""));
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const current = String(form.get("currentPassword") ?? "");
  const expired = Boolean(user.passwordExpiresAt && user.passwordExpiresAt < new Date());
  if (!verifyPassword(current, user.passwordHash))
    return go("securityError", "Mevcut şifrenizi kontrol edin.");
  if (!validUsername(username) || !z.string().email().max(254).safeParse(email).success)
    return go(
      "securityError",
      "Geçerli bir e-posta ve 3–32 karakterli kullanıcı adı girin. Kullanıcı adında a–z, rakam, nokta, tire ve alt çizgi kullanılabilir.",
    );
  if (password || user.mustChangePassword || expired) {
    const error = passwordPolicyError(password);
    if (error) return go("securityError", error);
    if (password !== form.get("confirmPassword"))
      return go("securityError", "Yeni şifreler eşleşmiyor.");
    if (verifyPassword(password, user.passwordHash))
      return go("securityError", "Yeni şifre geçici/mevcut şifrenizden farklı olmalı.");
  }
  if (!user.passwordChangedAt && user.username && username === user.username)
    return go(
      "securityError",
      "İlk girişte geçici kullanıcı adınızdan farklı bir kullanıcı adı belirleyin.",
    );
  const duplicate = await prisma.user.findFirst({
    where: { id: { not: user.id }, OR: [{ username }, { email }] },
    select: { id: true },
  });
  if (duplicate)
    return go("securityError", "Bu kullanıcı adı veya e-posta kullanılamıyor.");
  const nextHash = password ? hashPassword(password) : user.passwordHash;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          username,
          ...(password
            ? {
                passwordHash: nextHash,
                mustChangePassword: false,
                passwordChangedAt: new Date(),
                passwordExpiresAt: passwordExpiry(),
              }
            : {}),
        },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "account.updated",
          entityType: "User",
          entityId: user.id,
          metadata: { passwordChanged: Boolean(password) },
        },
      });
    });
  } catch {
    return go("securityError", "Hesap bilgileri kaydedilemedi. Yeniden deneyin.");
  }
  const session = await issueSession(user.id);
  let response;
  if (email !== user.email || !user.emailVerifiedAt) {
    try {
      await deliverAccountToken(user.id, email, "verify");
      response = go("security", "sent");
    } catch {
      response = go(
        "securityError",
        "Hesap bilgileriniz kaydedildi, ancak doğrulama e-postası gönderilemedi. E-posta gönderimi için yöneticinize başvurun; daha sonra tekrar deneyebilirsiniz.",
      );
    }
  } else response = go("security", "saved");
  response.cookies.set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(session.expiresAt),
  );
  return response;
}
