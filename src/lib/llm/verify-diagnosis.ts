import { isGeneralDefinitionReply } from "@/lib/conversation/general-definitions";
import type { SimulationDiagnosis } from "@/lib/simulator/rules";
import type { KnowledgeSnippet, LlmCompleteResult, LlmMessage } from "./types";
import type { OpenAiLlm } from "./openai";
import { CONTENT_SAFETY_VERSION } from "./content-safety";
import { isAdministrativeAcknowledgement } from "@/lib/conversation/administrative-replies";
import { assertUsageBudgetAvailable, recordModelUsage } from "@/lib/usage/record";

type Verifier = Pick<OpenAiLlm, "verifyContentSafety" | "verifyGrounding">;
export function blockUnverifiedDiagnosis(
  diagnosis: SimulationDiagnosis,
): SimulationDiagnosis {
  return {
    ...diagnosis,
    outbound:
      "Yanıtı güvenle doğrulayamadım. Size yardımcı olması için konuşmayı ekibimize aktarıyorum.",
    action: null,
    additionalActions: [],
    knowledge: null,
    handoff: { reason: "AI yanıtının içerik güvenliği doğrulanamadı." },
    botStopped: true,
    contentSafety:
      diagnosis.contentSafety?.status === "blocked"
        ? diagnosis.contentSafety
        : {
            version: CONTENT_SAFETY_VERSION,
            status: "unavailable",
            issues: [],
            failureStage: diagnosis.contentSafety?.failureStage,
          },
    rules: [
      ...diagnosis.rules,
      "İçerik güvenliği doğrulanmadı; aday cevap gönderilmedi ve işlem engellendi.",
    ],
  };
}

export async function verifyDiagnosis(
  candidate: SimulationDiagnosis,
  llm: Verifier,
  knowledge: KnowledgeSnippet[],
  usageContext: {
    userId?: string;
    therapistId?: string;
    conversationId?: string;
    messageId?: string;
  },
  history: LlmMessage[] = [],
): Promise<SimulationDiagnosis> {
  // All candidates reaching this boundary are checked, including cache hits,
  // action/handoff replies and general therapy answers with no source ID.
  const diagnosis = {
    ...candidate,
    rules: [...candidate.rules],
    contentSafety: undefined,
    grounding: undefined,
  };
  if (!diagnosis.outbound.trim()) return blockUnverifiedDiagnosis(diagnosis);
  if (/endişelenmenize gerek yok|kaygılanmanıza gerek yok/iu.test(diagnosis.outbound))
    return blockUnverifiedDiagnosis({
      ...diagnosis,
      contentSafety: {
        version: CONTENT_SAFETY_VERSION,
        status: "blocked",
        issues: ["invalidating_tone"],
      },
    });
  async function record(
    result: Partial<LlmCompleteResult>,
    task: "safety" | "grounding",
  ) {
    await recordModelUsage(
      {
        ...result,
        provider: "openai",
        model: result.model ?? diagnosis.model ?? "unknown",
        latencyMs: 0,
        turn: {
          intent: diagnosis.intent,
          confidence: diagnosis.confidence,
          reply: diagnosis.outbound,
          entities: diagnosis.entities,
          needsHandoff: false,
        },
      } as LlmCompleteResult,
      { ...usageContext, task, output: result },
    );
  }
  let requiresGrounding: boolean;
  let checked: SimulationDiagnosis = diagnosis;
  let failureStage: "budget" | "verifier" | "usage_recording" = "budget";
  try {
    await assertUsageBudgetAvailable();
    failureStage = "verifier";
    const safety = await llm.verifyContentSafety(
      diagnosis.outbound,
      diagnosis.inbound,
      history,
    );
    failureStage = "usage_recording";
    await record(safety, "safety");
    const approved = safety.safe === true && safety.issues.length === 0;
    checked = {
      ...diagnosis,
      contentSafety: {
        version: CONTENT_SAFETY_VERSION,
        status: approved ? "passed" : "blocked",
        issues: safety.issues,
      },
    };
    if (!approved) return blockUnverifiedDiagnosis(checked);
    checked.rules.push(
      "Ayrı içerik güvenliği model kontrolü geçti; bu sonuç klinik uzman onayı değildir.",
    );
    // Safety still checks the patient context. Only exact, code-owned status
    // text registered for this intent skips institutional-document verification.
    if (
      !checked.knowledge &&
      (isAdministrativeAcknowledgement(checked.outbound, checked.intent) ||
        isGeneralDefinitionReply(checked.outbound))
    ) {
      checked.rules.push(
        "Kodda tanımlı işlem bilgilendirmesi; ek kaynak modeli çağrılmadı.",
      );
      return checked;
    }
    requiresGrounding =
      safety.requiresGrounding ||
      Boolean(checked.knowledge) ||
      Boolean(
        checked.routing?.some((r) => ["THERAPIST_INFO", "CLINIC_INFO"].includes(r.kind)),
      ) ||
      ["CLINIC_INFO", "THERAPIST_INFO", "PRICE_REQUEST"].includes(checked.intent);
  } catch {
    return blockUnverifiedDiagnosis({
      ...diagnosis,
      contentSafety: {
        version: CONTENT_SAFETY_VERSION,
        status: "unavailable",
        issues: [],
        failureStage,
      },
    });
  }
  if (!requiresGrounding) return checked;
  try {
    await assertUsageBudgetAvailable();
    checked.grounding = await llm.verifyGrounding(checked.outbound, knowledge);
    await record(checked.grounding, "grounding");
    if (checked.grounding.supported) {
      checked.rules.push(
        "Ayrı kaynak kontrolü ve kaynakta birebir alıntı doğrulaması geçti.",
      );
      return checked;
    }
  } catch {
    checked.grounding = {
      supported: false,
      evidence: [],
      reason: "Kaynak doğrulaması tamamlanamadı.",
    };
  }
  return {
    ...checked,
    outbound:
      "Bu bilgiyi onaylı kaynaklarımızla doğrulayamadım. Doğru bilgi için sizi ekibimize aktarıyorum.",
    action: null,
    additionalActions: [],
    knowledge: null,
    handoff: { reason: "Yanıtın kaynak desteği doğrulanamadı." },
    botStopped: true,
    rules: [...checked.rules, "Kaynak doğrulaması başarısız; aday cevap gönderilmedi."],
  };
}
