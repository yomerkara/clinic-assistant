import { hasLocalEmailDeferral } from "@/lib/auth/local-email-deferral";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, issueSession, sessionCookieOptions } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import {
  newTotpSecret,
  verifyTotp,
  newRecoveryCodes,
  recoveryHash,
} from "@/lib/auth/totp";
import { encryptSecret, decryptSecret } from "@/lib/security/encryption";
import { publicOrigin } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/auth/constants";
export async function POST(request: Request) {
  const user = await requireUser({ allowIncompleteOnboarding: true });
  const form = await request.formData();
  const go = (message: string) =>
    NextResponse.redirect(
      new URL(
        `/onboarding?securityError=${encodeURIComponent(message)}`,
        publicOrigin(request),
      ),
      303,
    );
  if (!(await allowAuthAttempt("mfa-setup", user.id, 8)))
    return go("Çok fazla deneme. 15 dakika sonra tekrar deneyin.");
  if (user.mfaEnabledAt) return go("İki aşamalı doğrulama zaten etkin.");
  if (
    user.mustChangePassword ||
    (!user.emailVerifiedAt && !(await hasLocalEmailDeferral(user))) ||
    !user.username
  )
    return go("Önce kullanıcı adı, şifre ve e-posta doğrulamasını tamamlayın.");
  if (!verifyPassword(String(form.get("password") ?? ""), user.passwordHash))
    return go("Mevcut şifrenizi kontrol edin.");
  if (form.get("intent") === "start") {
    try {
      const encrypted = encryptSecret(newTotpSecret(), `${user.id}:totp`);
      await prisma.user.update({
        where: { id: user.id },
        data: { totpPendingEncrypted: encrypted },
      });
    } catch {
      return go("Güvenlik anahtarı yapılandırılmadı. Yöneticinize başvurun.");
    }
    return NextResponse.redirect(new URL("/onboarding", publicOrigin(request)), 303);
  }
  if (!user.totpPendingEncrypted) return go("Önce doğrulayıcı kurulumunu başlatın.");
  const counter = verifyTotp(
    decryptSecret(user.totpPendingEncrypted, `${user.id}:totp`),
    String(form.get("code") ?? "").trim(),
  );
  if (counter === null) return go("Doğrulama kodu hatalı veya süresi dolmuş.");
  const codes = newRecoveryCodes();
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: user.id,
          mfaEnabledAt: null,
          totpPendingEncrypted: user.totpPendingEncrypted,
        },
        data: {
          mfaEnabledAt: new Date(),
          totpSecretEncrypted: user.totpPendingEncrypted,
          totpPendingEncrypted: null,
          totpLastCounter: counter,
          recoveryCodeHashes: codes.map(recoveryHash),
        },
      });
      if (updated.count !== 1) throw new Error("Concurrent enrollment");
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "account.mfa_enabled",
          entityType: "User",
          entityId: user.id,
          metadata: {},
        },
      });
    });
  } catch {
    return go("Kurulum kaydedilemedi. Sayfayı yenileyip tekrar deneyin.");
  }
  const session = await issueSession(user.id);
  // Recovery codes are delivered once, never persisted in plaintext or a URL.
  const response = new NextResponse(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kurtarma kodları · Santa</title><style>body{font:16px/1.6 system-ui;background:#fafaf9;color:#20312b;max-width:520px;margin:8vh auto;padding:24px}code{display:block;padding:5px}a{color:#2e6f5e}</style></head><body><h1>İki aşamalı doğrulama etkin</h1><p>Bu kurtarma kodlarını şifre yöneticinize kaydedin. Telefonunuza erişemediğinizde her kod bir kez kullanılabilir. Kodlar bir daha gösterilmez.</p>${codes.map((c) => `<code>${c}</code>`).join("")}<p><a href="/onboarding">Kodları kaydettim, devam et →</a></p></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "same-origin",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      },
    },
  );
  response.cookies.set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(session.expiresAt),
  );
  return response;
}
