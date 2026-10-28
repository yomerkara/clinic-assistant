import type { SimulationDiagnosis } from "@/lib/simulator/rules";

export const CLINIC_CLARIFICATION =
  "Tabii, kliniğimizle ilgili hangi bilgiyi öğrenmek istersiniz: adres ve ulaşım, çalışma saatleri veya uzmanlarımız?";

export function isBroadClinicQuestion(text: string) {
  const normalized = text
    .toLocaleLowerCase("tr-TR")
    .trim()
    .replace(/[.!?]+$/u, "")
    .trim();
  // Match the whole message so concrete questions and safety concerns survive.
  return /^(?:klinik bilgisi|klinik hakkında bilgi|kliniğiniz hakkında bilgi)(?: (?:almak istiyorum|alabilir miyim|verir misiniz))?$/u.test(
    normalized,
  );
}

export function buildClinicClarification(
  inbound: string,
  now: Date,
): SimulationDiagnosis {
  return {
    id: `clinic_clarification_${now.getTime().toString(36)}`,
    inbound,
    outbound: CLINIC_CLARIFICATION,
    createdAt: now.toISOString(),
    intent: "CLINIC_INFO",
    intentLabel: "Klinik bilgisi netleştirmesi",
    confidence: 1,
    entities: {},
    knowledge: null,
    action: null,
    handoff: null,
    botStopped: false,
    rules: [
      "Genel klinik bilgisi isteğinde konu netleştirildi; bilgi iddiası veya işlem üretilmedi. LLM çağrılmadı.",
    ],
    raw: { handler: "clinic-clarification" },
    latencyMs: 0,
    model: null,
    promptVersion: "clinic-clarification-v1",
    provider: "fake",
  };
}
