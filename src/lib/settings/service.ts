import { prisma } from "@/lib/prisma";
import { mergeFlags, parseControls, type ClinicControls } from "./control";

/** The single clinic settings row; created on first read. */
export async function loadClinicControls(): Promise<ClinicControls> {
  const row = await prisma.clinicSettings.findUnique({ where: { id: "default" } });
  return parseControls(row);
}

export async function setAssistantEnabled(input: {
  enabled: boolean;
  actorId: string;
  reason?: string | null;
}) {
  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 300) : null;
  const row = await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      assistantEnabled: input.enabled,
      assistantDisabledAt: input.enabled ? null : new Date(),
      assistantDisabledBy: input.enabled ? null : input.actorId,
      assistantOffReason: input.enabled ? null : reason,
    },
    update: {
      assistantEnabled: input.enabled,
      assistantDisabledAt: input.enabled ? null : new Date(),
      assistantDisabledBy: input.enabled ? null : input.actorId,
      assistantOffReason: input.enabled ? null : reason,
    },
  });
  // Turning the assistant off or on changes what every patient receives, so it
  // is always recorded with the operator who did it.
  await prisma.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: input.enabled ? "assistant.enabled" : "assistant.disabled",
      entityType: "ClinicSettings",
      entityId: "default",
      metadata: { reason },
    },
  });
  return parseControls(row);
}

export async function updateFeatureFlags(input: {
  patch: Record<string, unknown>;
  actorId: string;
}) {
  const current = await prisma.clinicSettings.findUnique({ where: { id: "default" } });
  const flags = mergeFlags(
    current?.featureFlags && typeof current.featureFlags === "object" &&
      !Array.isArray(current.featureFlags)
      ? (current.featureFlags as Record<string, unknown>)
      : {},
    input.patch,
  );
  const row = await prisma.clinicSettings.upsert({
    where: { id: "default" },
    create: { id: "default", featureFlags: flags },
    update: { featureFlags: flags },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: input.actorId,
      action: "assistant.flags_updated",
      entityType: "ClinicSettings",
      entityId: "default",
      metadata: { flags },
    },
  });
  return parseControls(row);
}
