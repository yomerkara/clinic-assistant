import { prisma } from "@/lib/prisma";
import { catalogConfiguration, catalogModel } from "./catalog";
import { tierConfiguration } from "./tiers";

export async function currentModelConfiguration() {
  const settings = await prisma.clinicSettings.findUnique({
    where: { id: "default" },
    select: { aiModelId: true },
  });
  const fallback = tierConfiguration();
  const model = catalogModel(settings?.aiModelId ?? fallback.model);
  if (settings?.aiModelId && !model)
    throw new Error("Saved AI model is not in the catalog");
  return model ? catalogConfiguration(model) : fallback;
}
