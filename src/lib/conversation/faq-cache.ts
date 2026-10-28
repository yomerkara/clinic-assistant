import { prisma } from "@/lib/prisma";
import type { AssistantIntent } from "@/lib/llm/types";

const CACHEABLE_INTENTS = new Set<AssistantIntent>([
  "CLINIC_INFO",
  "THERAPIST_INFO",
  "THERAPY_INFO",
]);

export function normalizeFaqQuestion(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCacheableFaqQuestion(text: string) {
  const normalized = normalizeFaqQuestion(text);
  if (normalized.length < 5 || normalized.length > 180) return false;
  if (
    /\b(randevu|saat|tarih|iptal|fiyat|ucret|fatura|benim|bana|kendim|hissediyorum)\b/.test(
      normalized,
    )
  ) {
    return false;
  }
  return /\b(nedir|ne demek|nasil|ne ise yarar|hakkinda|hizmet|hizmetler|kimdir|kimler)\b/.test(
    normalized,
  );
}

export async function findCachedFaq(text: string) {
  if (!isCacheableFaqQuestion(text)) return null;
  const normalizedQuestion = normalizeFaqQuestion(text);
  const cached = await prisma.faqAnswerCache.findUnique({
    where: { normalizedQuestion },
  });
  if (
    !cached ||
    Date.now() - cached.createdAt.getTime() > 24 * 60 * 60 * 1000 ||
    !cached.knowledgeDocId
  )
    return null;
  const source = await prisma.knowledgeDocument.findUnique({
    where: { id: cached.knowledgeDocId },
  });
  if (
    !source ||
    source.approvalStatus !== "APPROVED" ||
    source.version !== cached.knowledgeVersion
  )
    return null;
  await prisma.faqAnswerCache.update({
    where: { id: cached.id },
    data: { hits: { increment: 1 } },
  });
  return cached;
}

export async function saveCachedFaq(input: {
  question: string;
  answer: string;
  intent: AssistantIntent;
  knowledgeDocId?: string | null;
  knowledgeVersion?: number | null;
}) {
  if (!CACHEABLE_INTENTS.has(input.intent) || !isCacheableFaqQuestion(input.question))
    return;
  if (!input.knowledgeDocId || input.knowledgeVersion == null) return;
  const source = await prisma.knowledgeDocument.findUnique({
    where: { id: input.knowledgeDocId },
  });
  if (
    !source ||
    source.approvalStatus !== "APPROVED" ||
    source.version !== input.knowledgeVersion
  )
    return;
  const answer = input.answer.trim();
  if (!answer || /uygun saatler:/i.test(answer)) return;
  await prisma.faqAnswerCache.upsert({
    where: { normalizedQuestion: normalizeFaqQuestion(input.question) },
    create: {
      normalizedQuestion: normalizeFaqQuestion(input.question),
      answer,
      intent: input.intent,
      knowledgeDocId: input.knowledgeDocId ?? null,
      knowledgeVersion: input.knowledgeVersion ?? null,
    },
    update: {
      createdAt: new Date(),
      answer,
      intent: input.intent,
      knowledgeDocId: input.knowledgeDocId ?? null,
      knowledgeVersion: input.knowledgeVersion ?? null,
    },
  });
}

export function isCachedIntent(value: string): value is AssistantIntent {
  return CACHEABLE_INTENTS.has(value as AssistantIntent);
}
