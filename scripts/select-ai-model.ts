import { catalogModel, CATALOG_VERSION } from "../src/lib/usage/catalog";
import { verifyModel } from "../src/lib/usage/verify-model";
import { prisma } from "../src/lib/prisma";

async function main() {
  const model = catalogModel(process.argv[2]);
  if (!model) throw new Error("Provide an existing model ID from the catalog.");
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new Error("Administrator account required.");
  // Use the same readiness gate as the model-selection page.
  await verifyModel(model, admin.id);
  await prisma.$transaction(async (tx) => {
    await tx.clinicSettings.upsert({
      where: { id: "default" },
      create: { id: "default", aiModelId: model.id },
      update: { aiModelId: model.id },
    });
    await tx.auditEvent.create({
      data: {
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
          origin: "operator-cli",
        },
      },
    });
  });
  console.log(`Selected ${model.id}; four readiness checks passed.`);
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
