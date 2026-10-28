import { prisma } from "@/lib/prisma";

/** Internal reminders only. Human-owned conversations never receive bot chatter. */
export async function remindWaitingConversations(
  now = new Date(),
  urgentConversationId?: string,
) {
  const waiting = await prisma.conversation.findMany({
    where: {
      mode: "HUMAN",
      ...(urgentConversationId ? { id: urgentConversationId } : {}),
    },
    select: {
      id: true,
      assignedToId: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, authorKind: true },
      },
    },
  });
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  let notifications = 0;
  for (const conversation of waiting) {
    const last = conversation.messages[0];
    if (
      !last ||
      last.authorKind === "STAFF" ||
      (!urgentConversationId && now.getTime() - last.createdAt.getTime() < 30 * 60000)
    )
      continue;
    const recipients = new Set(
      conversation.assignedToId ? [conversation.assignedToId] : admins.map((a) => a.id),
    );
    if (urgentConversationId || now.getTime() - last.createdAt.getTime() >= 2 * 3600000)
      admins.forEach((a) => recipients.add(a.id));
    // The unique notification id deduplicates concurrent job invocations too.
    const bucket = Math.floor(now.getTime() / (2 * 3600000));
    for (const recipientId of recipients) {
      const result = await prisma.notification.createMany({
        data: [
          {
            id: `waiting:${conversation.id}:${recipientId}:${bucket}`,
            recipientId,
            type: "WAITING_CONVERSATION",
            payload: {
              conversationId: conversation.id,
              waitingSince: last.createdAt.toISOString(),
            },
          },
        ],
        skipDuplicates: true,
      });
      notifications += result.count;
    }
  }
  return { notifications };
}
