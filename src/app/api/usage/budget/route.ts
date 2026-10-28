import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageUsageBudget } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const budgetSchema = z.coerce.number().min(1).max(10_000);

export async function POST(request: Request) {
  const user = await requireUser();
  const origin = publicOrigin(request);
  if (!canManageUsageBudget(user.role)) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }
  const form = await request.formData();
  const parsed = budgetSchema.safeParse(form.get("limitUsd"));
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/usage?budget=invalid", origin), 303);
  }
  await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", monthlyUsageLimitUsd: parsed.data },
    update: { monthlyUsageLimitUsd: parsed.data },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: user.id,
      action: "usage_budget_updated",
      entityType: "ClinicSettings",
      entityId: "default",
      metadata: { monthlyUsageLimitUsd: parsed.data },
    },
  });
  return NextResponse.redirect(new URL("/usage?budget=saved", origin), 303);
}
