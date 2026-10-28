// What the patient is told when the model, its verifier or the usage budget
// stops a turn. Extracted from handleInbound: no appointment or queue record is
// ever produced on this path, so the wording must not imply one.
import type { ModelFailure } from "@/lib/llm/failure";

export type ServiceFailureReply = {
  reason: string;
  intentLabel: string;
  promptVersion: string;
  rule: string;
  outbound: string;
  handoff: { reason: string } | null;
  botStopped: boolean;
};

export function serviceFailureReply(input: {
  failure: ModelFailure;
  budgetExceeded: boolean;
}): ServiceFailureReply {
  const { failure, budgetExceeded } = input;
  // A retryable transport error keeps the conversation with the assistant; an
  // exhausted budget or an unrecoverable failure moves it to the team.
  const botStopped = budgetExceeded || !failure.retryable;
  const handoffReason = budgetExceeded
    ? "Aylık AI kullanım limiti doldu."
    : "Model yanıtı alınamadı.";
  return {
    reason: budgetExceeded ? "Aylık kullanım limiti doldu." : "Model yanıtı alınamadı.",
    intentLabel: "Yanıt servisi hatası",
    promptVersion: "service-failure-v1",
    rule: budgetExceeded
      ? "Aylık kullanım sınırı nedeniyle işlem yapılmadı."
      : `AI işlemi başarısız: ${failure.kind}. Hiçbir randevu veya işlem oluşturulmadı.`,
    outbound: budgetExceeded
      ? "Mesajınızı aldım. Size yardımcı olabilmesi için konuşmayı ekibimize aktarıyorum."
      : failure.retryable
        ? "Şu anda bağlantı sorunu nedeniyle yanıt veremiyorum. Aynı mesajı biraz sonra tekrar gönderebilir misiniz?"
        : "Şu an yanıtı tamamlayamadım. Talebinizi ekibe ilettim; en kısa sürede dönüş yapılacak.",
    handoff: botStopped ? { reason: handoffReason } : null,
    botStopped,
  };
}
