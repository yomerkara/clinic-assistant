import { z } from "zod";
import type { KnowledgeSnippet, LlmCompleteResult } from "./types";
const schema = z.object({
  supported: z.boolean(),
  evidence: z
    .array(
      z.object({
        documentId: z.string(),
        quote: z.string().min(8),
        version: z.number().optional(),
      }),
    )
    .max(20),
  reason: z.string().max(1000),
});
export type GroundingResult = z.infer<typeof schema> &
  Partial<Pick<LlmCompleteResult, "usage" | "model" | "pricing">>;
export function validateGrounding(
  raw: unknown,
  knowledge: KnowledgeSnippet[],
): GroundingResult {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return { supported: false, evidence: [], reason: "Doğrulama biçimi geçersiz." };
  const result = parsed.data;
  const valid =
    result.evidence.length > 0 &&
    result.evidence.every((e) =>
      knowledge.some((d) => d.id === e.documentId && d.content.includes(e.quote)),
    );
  return {
    ...result,
    evidence: result.evidence.map((e) => ({
      ...e,
      version: knowledge.find((d) => d.id === e.documentId)?.version,
    })),
    supported: result.supported && valid,
    reason: valid ? result.reason : "Kanıt alıntıları onaylı kaynakta doğrulanamadı.",
  };
}
