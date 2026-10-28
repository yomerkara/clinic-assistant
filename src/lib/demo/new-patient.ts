import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

function prefix(adminUserId: string) {
  return `demo:${adminUserId}:new:`;
}

export async function findNewDemoPatient(adminUserId: string) {
  // A party can create several patients with one phone. The active conversation,
  // rather than the newest patient, owns the demo session.
  const conversation = await prisma.conversation.findFirst({
    where: { phone: { startsWith: prefix(adminUserId) }, source: "demo" },
    orderBy: { id: "desc" },
    include: { patient: true },
  });
  return conversation?.patient ?? null;
}

export function createNewDemoPatient(adminUserId: string) {
  const phone = `${prefix(adminUserId)}${randomUUID()}`;
  return prisma.patient.create({
    data: {
      phone,
      displayName: "Yeni Hasta",
      conversations: { create: { phone, source: "demo", mode: "BOT" } },
    },
  });
}
