import { canDeferSetup } from "@/lib/auth/setup-deferral";
import {
  canDeferAdminEmail,
  hasLocalEmailDeferral,
  LOCAL_ADMIN_EMAIL,
} from "@/lib/auth/local-email-deferral";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, issueSession, sessionCookieOptions } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { publicOrigin } from "@/lib/http";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { deliverAccountToken } from "@/lib/auth/tokens";
import { hashPasswordAsync, verifyPasswordAsync } from "@/lib/auth/password-async";
import {
  normalizeUsername,
  validUsername,
  passwordPolicyError,
  passwordExpiry,
} from "@/lib/auth/policy";
import { normalizeSetupPhone } from "@/lib/auth/onboarding";

export async function POST(request: Request) {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  const go = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/onboarding?${new URLSearchParams(params)}`, publicOrigin(request)),
      303,
    );
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (
    !["email", "phone", "password", "security-defer", "security-resume"].includes(intent)
  )
    return go({ securityError: "Geçersiz kurulum adımı." });
  const localEmailRequest =
    intent === "email" &&
    String(form.get("email") ?? "")
      .trim()
      .toLowerCase() === LOCAL_ADMIN_EMAIL &&
    canDeferAdminEmail(user);
  if (
    !(await allowAuthAttempt(
      localEmailRequest ? "onboarding-local-email" : `onboarding-${intent}`,
      user.id,
      intent === "email" && !localEmailRequest ? 3 : 8,
    ))
  )
    return go({ securityError: "Çok fazla deneme. 15 dakika sonra tekrar deneyin." });
  try {
    if (intent === "security-defer" || intent === "security-resume") {
      if (!canDeferSetup())
        return go({ securityError: "Hesap güvenliği bu ortamda ertelenemez." });
      if (
        intent === "security-defer" &&
        (!user.phone || (!user.emailVerifiedAt && !(await hasLocalEmailDeferral(user))))
      )
        return go({ securityError: "Önce e-posta ve telefon adımlarını tamamlayın." });
      await prisma.auditEvent.create({
        data: {
          actorId: user.id,
          entityId: user.id,
          entityType: "User",
          action:
            intent === "security-defer"
              ? "account.local_security_deferred"
              : "account.local_security_resumed",
          metadata: { localOnly: true },
        },
      });
      return go(intent === "security-resume" ? { step: "2" } : {});
    }
    if (intent === "email") {
      const email = String(form.get("email") ?? "")
        .trim()
        .toLowerCase();
      if (!z.string().email().max(254).safeParse(email).success)
        return go({ step: "0", securityError: "Geçerli bir e-posta adresi girin." });
      if (email === LOCAL_ADMIN_EMAIL) {
        if (!canDeferAdminEmail(user))
          return go({
            securityError: "Bu adres için yerel kurulum istisnası kullanılamaz.",
          });
        await prisma.auditEvent.create({
          data: {
            actorId: user.id,
            action: "account.local_email_deferred",
            entityType: "User",
            entityId: user.id,
            metadata: { localOnly: true },
          },
        });
        return go({});
      }
      if (user.emailVerifiedAt) return go({}); // Changes to verified addresses belong in account settings.
      const duplicate = await prisma.user.findFirst({
        where: { email, id: { not: user.id } },
        select: { id: true },
      });
      if (duplicate)
        return go({ step: "0", securityError: "Bu e-posta adresi kullanılamıyor." });
      await deliverAccountToken(user.id, email, "verify");
      return go({ step: "0", security: "sent" });
    }
    if (!user.emailVerifiedAt && !(await hasLocalEmailDeferral(user)))
      return go({ securityError: "Önce e-posta adresinizi doğrulayın." });
    if (intent === "phone") {
      const phone = normalizeSetupPhone(String(form.get("phone") ?? ""));
      if (!phone)
        return go({
          step: "1",
          securityError: "Geçerli bir telefon numarası girin. Örnek: +90 532 123 45 67.",
        });
      await prisma.user.update({ where: { id: user.id }, data: { phone } });
      return go({});
    }
    if (!user.phone) return go({ securityError: "Önce telefon numaranızı kaydedin." });
    const username = normalizeUsername(String(form.get("username") ?? ""));
    const password = String(form.get("password") ?? "");
    const current = String(form.get("currentPassword") ?? "");
    const error = passwordPolicyError(password);
    if (!validUsername(username) || error || password !== form.get("confirmPassword"))
      return go({
        step: "2",
        securityError: error ?? "Kullanıcı adını ve eşleşen şifreleri kontrol edin.",
      });
    if (!user.passwordChangedAt && username === user.username)
      return go({
        step: "2",
        securityError: "Geçici kullanıcı adınızdan farklı bir kullanıcı adı seçin.",
      });
    if (!(await verifyPasswordAsync(current, user.passwordHash)))
      return go({ step: "2", securityError: "Mevcut / geçici şifrenizi kontrol edin." });
    if (await verifyPasswordAsync(password, user.passwordHash))
      return go({
        step: "2",
        securityError: "Yeni şifreniz mevcut şifrenizden farklı olmalı.",
      });
    const nextHash = await hashPasswordAsync(password);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: {
          username,
          passwordHash: nextHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          passwordExpiresAt: passwordExpiry(),
        },
      });
      if (updated.count !== 1) throw new Error("Concurrent password update");
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.securityToken.deleteMany({ where: { userId: user.id, kind: "reset" } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "account.onboarding_password_changed",
          entityType: "User",
          entityId: user.id,
          metadata: {},
        },
      });
    });
    const session = await issueSession(user.id);
    const response = go({ security: "saved" });
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
          ? "Doğrulama e-postası gönderilemedi. Adresi kontrol edin; sorun sürerse yöneticinize başvurun."
          : "İşlem tamamlanamadı. Bilgilerinizi kontrol edip biraz sonra tekrar deneyin.",
    });
  }
}
