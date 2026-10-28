import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { allowAuthAttempt } from "@/lib/auth/rate-limit";
import { deliverAccountToken } from "@/lib/auth/tokens";
import { publicOrigin } from "@/lib/http";
export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  if (await allowAuthAttempt("reset-request", email, 3)) {
    const user = await prisma.user.findFirst({
      where: { email, active: true, emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    if (user)
      after(() =>
        deliverAccountToken(user.id, email, "reset").catch(() => {
          // Do not disclose account existence or recovery tokens in the response/logs.
          console.error("Account recovery email delivery failed");
        }),
      );
  }
  return NextResponse.redirect(
    new URL("/forgot-password?sent=1", publicOrigin(request)),
    303,
  );
}
