import { beforeEach, describe, expect, it, vi } from "vitest";
import { findCachedFaq, isCacheableFaqQuestion, normalizeFaqQuestion } from "./faq-cache";

describe("FAQ answer cache", () => {
  it("normalizes repeated Turkish questions to the same key", () => {
    expect(normalizeFaqQuestion("EMDR nedir?")).toBe(
      normalizeFaqQuestion("  emdr NEDİR!!! "),
    );
  });

  it("caches general questions but never personal scheduling requests", () => {
    expect(isCacheableFaqQuestion("EMDR nedir?")).toBe(true);
    expect(isCacheableFaqQuestion("Bana salı 16.00 için randevu var mı?")).toBe(false);
  });
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    faqAnswerCache: { findUnique: vi.fn(), update: vi.fn() },
    knowledgeDocument: { findUnique: vi.fn() },
  },
}));
import { prisma } from "@/lib/prisma";

describe("cached source validity", () => {
  beforeEach(() => vi.resetAllMocks());
  const cached = {
    id: "cache",
    normalizedQuestion: "emdr nedir",
    answer: "Onaylı yanıt",
    intent: "THERAPY_INFO",
    knowledgeDocId: "doc",
    knowledgeVersion: 2,
    hits: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  it("rejects an expired answer before returning or counting it", async () => {
    vi.mocked(prisma.faqAnswerCache.findUnique).mockResolvedValue({
      ...cached,
      createdAt: new Date(Date.now() - 25 * 3600000),
    });
    expect(await findCachedFaq("EMDR nedir?")).toBeNull();
    expect(prisma.faqAnswerCache.update).not.toHaveBeenCalled();
  });
  it.each(["ARCHIVED", "DRAFT"] as const)(
    "rejects a source that is now %s",
    async (approvalStatus) => {
      vi.mocked(prisma.faqAnswerCache.findUnique).mockResolvedValue(cached);
      vi.mocked(prisma.knowledgeDocument.findUnique).mockResolvedValue({
        id: "doc",
        title: "EMDR",
        content: "Yeni içerik",
        source: "clinic",
        sourceUrl: null,
        contentHash: null,
        pendingContent: null,
        pendingHash: null,
        lastSyncedAt: null,
        approvalStatus,
        version: 2,
        createdAt: new Date(),
      });
      expect(await findCachedFaq("EMDR nedir?")).toBeNull();
    },
  );
  it("rejects an approved source whose version changed", async () => {
    vi.mocked(prisma.faqAnswerCache.findUnique).mockResolvedValue(cached);
    vi.mocked(prisma.knowledgeDocument.findUnique).mockResolvedValue({
      id: "doc",
      title: "EMDR",
      content: "Yeni içerik",
      source: "clinic",
      sourceUrl: null,
      contentHash: null,
      pendingContent: null,
      pendingHash: null,
      lastSyncedAt: null,
      approvalStatus: "APPROVED",
      version: 3,
      createdAt: new Date(),
    });
    expect(await findCachedFaq("EMDR nedir?")).toBeNull();
  });
});
