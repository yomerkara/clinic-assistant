import { z } from "zod";

const nullableChoice = z
  .enum(["", "true", "false"])
  .transform((value) => (value === "" ? null : value === "true"));
export const patientEditSchema = z.object({
  guardianName: z
    .string()
    .trim()
    .max(120)
    .transform((s) => s || null)
    .optional(),
  guardianConsent: nullableChoice.optional(),
  guardianAccompanies: nullableChoice.optional(),
  version: z.coerce.number().int().min(0),
  displayName: z.string().trim().min(2).max(120),
  age: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(120)])
    .transform((value) => (value === "" ? null : value)),
  hasTherapyHistory: nullableChoice,
  availabilityNotes: z
    .string()
    .trim()
    .max(500)
    .transform((value) => value || null),
  alternativeDaysOkay: nullableChoice,
});
