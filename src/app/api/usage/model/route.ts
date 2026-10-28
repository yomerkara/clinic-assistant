import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { catalogModel, CATALOG_VERSION } from "@/lib/usage/catalog";
import { verifyModel } from "@/lib/usage/verify-model";

export async function POST(request: Request) {
  const user = await requireUser();
  if (user.role !== "ADMIN")
    return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
  const form = await request.formData();
  const model = catalogModel(form.get("modelId"));
  const origin = publicOrigin(request);
  if (!model) return NextResponse.redirect(new URL("/usage?model=invalid", origin), 303);
  try {
    await verifyModel(model, user.id);
  } catch {
    return NextResponse.redirect(new URL("/usage?model=failed", origin), 303);
  }
  await prisma.$transaction(async (tx) => {
    await tx.clinicSettings.upsert({
      where: { id: "default" },
      create: { id: "default", aiModelId: model.id },
      update: { aiModelId: model.id },
    });
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action: "ai_model_updated",
        entityType: "ClinicSettings",
        entityId: "default",
        metadata: {
          model: model.id,
          tier: model.tier,
          inputUsd: model.input,
          outputUsd: model.output,
          tariffVersion: CATALOG_VERSION,
          readinessSuite: "model-readiness-v2",
          readinessChecks: 4,
        },
      },
    });
  });
  return NextResponse.redirect(new URL("/usage?model=saved", origin), 303);
}
