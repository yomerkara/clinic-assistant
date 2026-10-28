import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createToken } from "./password";
import { sendAuthMail } from "./mail";
export function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function deliverAccountToken(
  userId: string,
  email: string,
  kind: "verify" | "reset",
  returnTo?: "account",
) {
  const token = createToken();
  const record = await prisma.$transaction(async (tx) => {
    await tx.securityToken.deleteMany({ where: { userId, kind } });
    return tx.securityToken.create({
      data: {
        userId,
        kind,
        target: email,
        tokenHash: digestToken(token),
        expiresAt: new Date(Date.now() + (kind === "reset" ? 20 : 30) * 60000),
      },
    });
  });
  // Use configured origin only, never an untrusted Host header for recovery links.
  const url = new URL(
    kind === "reset" ? "/reset-password" : "/verify-email",
    process.env.APP_URL ?? "http://localhost:3000",
  );
  url.searchParams.set("token", token);
  if (returnTo === "account") url.searchParams.set("returnTo", "account");
  try {
    await sendAuthMail(
      email,
      kind === "reset" ? "Santa · Şifre sıfırlama" : "Santa · E-posta doğrulama",
      `${kind === "reset" ? "Yeni şifrenizi belirlemek" : "E-posta adresinizi doğrulamak"} için bağlantıyı açın:\n\n${url}\n\nBu bağlantı tek kullanımlıktır ve ${kind === "reset" ? 20 : 30} dakika geçerlidir. Bu isteği siz yapmadıysanız bağlantıyı kullanmayın.`,
      record.id,
    );
  } catch (error) {
    await prisma.securityToken.deleteMany({ where: { id: record.id } });
    throw error;
  }
}
