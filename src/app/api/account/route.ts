import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, issueSession, sessionCookieOptions } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { publicOrigin } from "@/lib/http";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { normalizeSetupPhone } from "@/lib/auth/onboarding";
import { hashPasswordAsync, verifyPasswordAsync } from "@/lib/auth/password-async";
import { passwordPolicyError, passwordExpiry } from "@/lib/auth/policy";
import { deliverAccountToken } from "@/lib/auth/tokens";
import { sendAuthMail } from "@/lib/auth/mail";
export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const section = ["profile", "email", "password"].includes(intent) ? intent : "profile";
  const go = (values: Record<string, string>) =>
    NextResponse.redirect(
      new URL(
        `/settings/account?${new URLSearchParams({ section, ...values })}`,
        publicOrigin(request),
      ),
      303,
    );
  if (section !== intent) return go({ securityError: "Geçersiz işlem." });
  if (!(await allowAuthAttempt(`account-${intent}`, user.id, intent === "email" ? 3 : 8)))
    return go({ securityError: "Çok fazla deneme. 15 dakika sonra yeniden deneyin." });
  try {
    if (intent === "profile") {
      const name = String(form.get("name") ?? "")
        .trim()
        .replace(/\s+/g, " ");
      const phone = normalizeSetupPhone(String(form.get("phone") ?? ""));
      if (name.length < 2 || name.length > 100 || /[\x00-\x1f\x7f]/.test(name) || !phone)
        return go({
          securityError: "Ad soyad (2–100 karakter) ve geçerli telefon numarası girin.",
        });
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { name, phone } });
        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            action: "account.profile_updated",
            entityType: "User",
            entityId: user.id,
            metadata: { fields: ["name", "phone"] },
          },
        });
      });
      return go({ security: "profile_saved" });
    }
    const current = String(form.get("currentPassword") ?? "");
    const password = String(form.get("password") ?? "");
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    if (intent === "email" && !z.string().email().max(254).safeParse(email).success)
      return go({ securityError: "Geçerli bir e-posta adresi girin." });
    if (intent === "password") {
      const error = passwordPolicyError(password);
      if (error || password !== form.get("confirmPassword"))
        return go({ securityError: error ?? "Yeni şifreler eşleşmiyor." });
    }
    if (!(await verifyPasswordAsync(current, user.passwordHash)))
      return go({ securityError: "Mevcut şifrenizi kontrol edin." });
    if (intent === "email") {
      if (email === user.email && user.emailVerifiedAt)
        return go({ security: "verified" });
      if (
        await prisma.user.findFirst({
          where: { email, id: { not: user.id } },
          select: { id: true },
        })
      )
        return go({ securityError: "Bu e-posta adresi kullanılamıyor." });
      await deliverAccountToken(user.id, email, "verify", "account");
      return go({ security: "sent" });
    }
    if (await verifyPasswordAsync(password, user.passwordHash))
      return go({ securityError: "Yeni şifreniz mevcut şifrenizden farklı olmalı." });
    const hash = await hashPasswordAsync(password);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash, active: true },
        data: {
          passwordHash: hash,
          passwordChangedAt: new Date(),
          passwordExpiresAt: passwordExpiry(),
          mustChangePassword: false,
        },
      });
      if (updated.count !== 1) throw new Error("Concurrent password update");
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.securityToken.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "account.password_updated",
          entityType: "User",
          entityId: user.id,
          metadata: {},
        },
      });
    });
    const session = await issueSession(user.id);
    if (user.emailVerifiedAt)
      await sendAuthMail(
        user.email,
        "Santa · Şifreniz güncellendi",
        "Hesabınızın şifresi değiştirildi ve eski oturumlarınız kapatıldı. İşlemi siz yapmadıysanız klinik yöneticinizle iletişime geçin.",
        `password-notice-${crypto.randomUUID()}`,
      ).catch(() => console.error("Password notification unavailable"));
    const response = go({ security: "password_saved" });
    response.cookies.set(
      SESSION_COOKIE,
      session.token,
      sessionCookieOptions(session.expiresAt),
    );
    return response;
  } catch {
    return go({
      securityError:
        intent === "email"
          ? "Doğrulama e-postası gönderilemedi. Mevcut adresiniz korundu; biraz sonra yeniden deneyin."
          : "Değişiklik kaydedilemedi. Biraz sonra yeniden deneyin.",
    });
  }
}
