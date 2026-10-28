import type { PrismaClient } from "@prisma/client";

export type SummaryMessage = {
  id: string;
  authorKind: string;
  text: string;
  createdAt: Date;
};

const excerpt = (text: string) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 320 ? `${clean.slice(0, 317)}…` : clean;
};

/** Quotes are evidence, never scheduling instructions or proof of availability. */
export function buildLiveSummary(
  initial: SummaryMessage | null,
  messages: SummaryMessage[],
) {
  const ordered = [...messages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  const updates = ordered
    .filter(
      (message) =>
        message.id !== initial?.id &&
        ["PATIENT", "STAFF"].includes(message.authorKind) &&
        message.text.trim(),
    )
    .slice(-4)
    .map((message) => {
      const index = ordered.findIndex((item) => item.id === message.id);
      const previous = ordered[index - 1];
      return {
        ...message,
        text: excerpt(message.text),
        // Keep the question with a customer's reply, so "yes" has context.
        context:
          message.authorKind === "PATIENT" && previous?.authorKind === "BOT"
            ? excerpt(previous.text)
            : null,
      };
    });
  if (!initial && !updates.length) return null;
  return {
    initial: initial ? excerpt(initial.text) : null,
    updates,
    updatedAt: updates.at(-1)?.createdAt ?? initial!.createdAt,
  };
}

export async function getLiveSummary(
  prisma: PrismaClient,
  action: { status: string; conversationId: string | null; createdAt: Date },
) {
  if (!action.conversationId || !["PENDING", "NEEDS_RECHECK"].includes(action.status))
    return null;
  const select = { id: true, authorKind: true, text: true, createdAt: true };
  // The request belongs to this part of the conversation, not its first-ever message.
  const initial = await prisma.message.findFirst({
    where: {
      conversationId: action.conversationId,
      authorKind: "PATIENT",
      createdAt: { lte: action.createdAt },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select,
  });
  const messages = await prisma.message.findMany({
    where: {
      conversationId: action.conversationId,
      createdAt: { gte: action.createdAt },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 16,
    select,
  });
  return buildLiveSummary(initial, messages);
}
