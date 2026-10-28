import type { PricingSnapshot } from "@/lib/usage/tiers";
import { z } from "zod";

export const assistantIntentSchema = z.enum([
  "CONFIRM",
  "CANCEL",
  "RESCHEDULE",
  "NEW_BOOKING",
  "CLINIC_INFO",
  "THERAPIST_INFO",
  "THERAPY_INFO",
  "HUMAN_REQUEST",
  "SENSITIVE_OR_EMERGENCY",
  "THERAPIST_CHANGE",
  "LATE_NOTICE",
  "PRICE_REQUEST",
  "INVOICE_REQUEST",
  "UNKNOWN",
]);

export type AssistantIntent = z.infer<typeof assistantIntentSchema>;

export const llmEntitiesSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Geçerli bir takvim tarihi gerekli")
    .nullable()
    .optional(),
  time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  topic: z.string().nullable().optional(),
  therapistName: z.string().nullable().optional(),
  therapistPreference: z.enum(["SELECTED", "UNDECIDED"]).nullable().optional(),
  patientName: z.string().nullable().optional(),
  age: z.number().int().min(0).max(120).nullable().optional(),
  hasTherapyHistory: z.boolean().nullable().optional(),
  availabilityNotes: z.string().max(500).nullable().optional(),
  alternativeDaysOkay: z.boolean().nullable().optional(),
});

export const routedRequestSchema = z
  .object({
    kind: z.enum([
      "THERAPIST_INFO",
      "CLINIC_INFO",
      "THERAPY_INFO",
      "NEW_BOOKING",
      "PRICE_REQUEST",
      "INVOICE_REQUEST",
    ]),
    answer: z.string().max(2000).nullable().optional(),
    knowledgeDocId: z.string().nullable().optional(),
  })
  .strict();
export type RoutedRequest = z.infer<typeof routedRequestSchema>;

export const llmTurnSchema = z.object({
  intent: assistantIntentSchema,
  requests: z.array(routedRequestSchema).max(6).optional(),
  confidence: z.number().min(0).max(1),
  reply: z.string().min(1),
  questionAnswer: z.string().max(2000).nullable().optional(),
  acknowledgement: z.string().max(400).nullable().optional(),
  entities: llmEntitiesSchema.default({}),
  knowledgeDocId: z.string().nullable().optional(),
  needsHandoff: z.boolean().default(false),
  handoffReason: z.string().nullable().optional(),
  memorySummary: z.string().max(2000).nullable().optional(),
});

export type LlmTurn = z.infer<typeof llmTurnSchema>;

export type LlmMessage = { role: "patient" | "assistant"; text: string };

export type KnowledgeSnippet = {
  id: string;
  title: string;
  content: string;
  source: string;
  version: number;
};

export type LlmCompleteInput = {
  history: LlmMessage[];
  inbound: string;
  nowIso: string;
  appointmentsSummary: string;
  knowledge: KnowledgeSnippet[];
  modelVersion: string;
  patientAddress?: string | null;
  sessionNotes?: string | null;
};

export type LlmCompleteResult = {
  turn: LlmTurn;
  latencyMs: number;
  model: string;
  provider: "openai" | "fake";
  pricing?: PricingSnapshot;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type LlmPort = {
  complete(input: LlmCompleteInput): Promise<LlmCompleteResult>;
};

export class ModelCallError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ModelCallError";
  }
}

export const CONFIDENCE_THRESHOLD = 0.7;
export { PROMPT_VERSION } from "./prompt";
export const MODEL_VERSION_LABEL = "intent-v3";
