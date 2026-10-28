import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOfficialTherapists } from "@/lib/santa/therapists";

const PAGES: Array<{ id: string; title: string; slugs: string[]; sourceUrl: string }> = [
  {
    id: "kd_clinic",
    title: "Klinik hakkında",
    slugs: ["hakkimizda", "about", ""],
    sourceUrl: "https://www.santapsikoloji.com/",
  },
  {
    id: "kd_emdr",
    title: "EMDR hakkında genel bilgi",
    slugs: ["emdr", "emdr-terapisi"],
    sourceUrl: "https://www.santapsikoloji.com/",
  },
  {
    id: "kd_cbt",
    title: "Davranışçı terapi hakkında",
    slugs: ["bilissel-davranisci-terapi", "bdt", "davranisci-terapi"],
    sourceUrl: "https://www.santapsikoloji.com/",
  },
];

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPage(slugs: string[]) {
  for (const slug of slugs.filter(Boolean)) {
    const url = `https://www.santapsikoloji.com/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`;
    try {
      const response = await fetch(url, { next: { revalidate: 0 } });
      if (!response.ok) continue;
      const records = (await response.json()) as Array<{
        link?: string;
        content?: { rendered?: string };
        excerpt?: { rendered?: string };
      }>;
      const record = records[0];
      const html = record?.content?.rendered || record?.excerpt?.rendered;
      if (!html) continue;
      const content = cleanHtml(html);
      if (content.length < 40) continue;
      return { content, sourceUrl: record.link ?? `https://www.santapsikoloji.com/${slug}/` };
    } catch {
      continue;
    }
  }
  return null;
}

export async function syncOfficialKnowledge() {
  const now = new Date();
  const therapists = await getOfficialTherapists();
  const therapistContent = therapists
    .map((item) => `${item.displayName} — ${item.specialties.join(", ")}. Profil: ${item.profileUrl}`)
    .join("\n");

  const updates: Array<{ id: string; title: string; changed: boolean }> = [];

  async function applyChange(input: {
    id: string;
    title: string;
    content: string;
    sourceUrl: string;
  }) {
    const contentHash = hashContent(input.content);
    const existing = await prisma.knowledgeDocument.findUnique({ where: { id: input.id } });
    if (!existing) {
      await prisma.knowledgeDocument.create({
        data: {
          id: input.id,
          title: input.title,
          content: input.content,
          source: input.sourceUrl,
          sourceUrl: input.sourceUrl,
          contentHash,
          approvalStatus: "DRAFT",
          lastSyncedAt: now,
          version: 1,
        },
      });
      updates.push({ id: input.id, title: input.title, changed: true });
      return;
    }
    const unchanged = existing.contentHash === contentHash || existing.content === input.content;
    await prisma.knowledgeDocument.update({
      where: { id: input.id },
      data: unchanged
        ? { lastSyncedAt: now, sourceUrl: input.sourceUrl, source: input.sourceUrl }
        : {
            pendingContent: input.content,
            pendingHash: contentHash,
            lastSyncedAt: now,
            sourceUrl: input.sourceUrl,
          },
    });
    updates.push({ id: input.id, title: input.title, changed: !unchanged });
  }

  for (const page of PAGES) {
    const fetched = await fetchPage(page.slugs);
    if (!fetched) continue;
    await applyChange({ ...page, content: fetched.content, sourceUrl: fetched.sourceUrl });
  }

  await applyChange({
    id: "kd_therapists",
    title: "Santa Psikoloji psikologları",
    content: therapistContent,
    sourceUrl: "https://www.santapsikoloji.com/psikologlarimiz/",
  });

  return updates;
}

export async function approvePendingKnowledge(id: string) {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id } });
  if (!doc?.pendingContent) {
    throw new Error("pending missing");
  }
  return prisma.knowledgeDocument.update({
    where: { id },
    data: {
      content: doc.pendingContent,
      contentHash: doc.pendingHash,
      pendingContent: null,
      pendingHash: null,
      approvalStatus: "APPROVED",
      version: doc.version + 1,
    },
  });
}

export async function approveDraftKnowledge(id: string) {
  return prisma.knowledgeDocument.update({
    where: { id },
    data: { approvalStatus: "APPROVED" },
  });
}
