import type { LlmPort, LlmTurn } from "./types";

function turn(partial: Omit<LlmTurn, "entities" | "needsHandoff"> & Partial<Pick<LlmTurn, "entities" | "needsHandoff">>): LlmTurn {
  return {
    entities: {},
    needsHandoff: false,
    ...partial,
  };
}

export class FakeLlm implements LlmPort {
  async complete(input: Parameters<LlmPort["complete"]>[0]) {
    const text = input.inbound.toLocaleLowerCase("tr");
    const knowledge = input.knowledge;
    let result: LlmTurn;

    if (/(intihar|kendimi öldür|acil|kriz|şiddet)/i.test(text)) {
      result = turn({
        intent: "SENSITIVE_OR_EMERGENCY",
        confidence: 0.96,
        reply: "Bu konuda size güvenli bir yönlendirme ile döneceğim; ekibimiz devralacak.",
        needsHandoff: true,
        handoffReason: "Hassas / acil içerik",
      });
    } else if (/terapist değiş/.test(text)) {
      result = turn({
        intent: "THERAPIST_CHANGE",
        confidence: 0.91,
        reply: "Terapist değişikliği talebinizi ekibe ilettim; sizinle iletişime geçecekler.",
        needsHandoff: true,
        handoffReason: "Terapist değişikliği talebi",
      });
    } else if (/çalışan|insan|danışmanla konuş|müşteri temsilcisi|canlı destek|birinizle konuş/.test(text)) {
      result = turn({
        intent: "HUMAN_REQUEST",
        confidence: 0.9,
        reply: "Sizi bir çalışanımızla görüştürmek üzere ekibe iletiyorum.",
        needsHandoff: true,
        handoffReason: "Hasta çalışanla görüşmek istedi",
      });
    } else if (/emdr/.test(text)) {
      const doc = knowledge.find((item) => /emdr/i.test(item.title + item.content));
      result = turn({
        intent: "THERAPY_INFO",
        confidence: 0.88,
        reply: doc
          ? `${doc.content.split(".")[0]!.trim()}. Size uygun olup olmadığını uzmanımız birlikte değerlendirir; isterseniz bir görüşme ayarlayabiliriz.`
          : "EMDR, zorlayıcı anılarla ilişkili duygu ve düşüncelerin işlenmesini amaçlayan bir terapi yaklaşımıdır. Uygunluğu kişiye göre bir uzmanla değerlendirilir. EMDR hakkında özellikle neyi merak ediyorsunuz?",
        entities: { topic: "emdr_sure" },
        knowledgeDocId: doc?.id,
        needsHandoff: false,
      });
    } else if (/klinik|nerede|adres/.test(text)) {
      const doc = knowledge.find((item) => /klinik/i.test(item.title));
      result = turn({
        intent: "CLINIC_INFO",
        confidence: 0.86,
        reply: doc
          ? `${doc.content} Daha ayrıntılı bilgi için uzman görüşmesi ayarlayabiliriz.`
          : "Bu bilgi onaylı havuzda yok; ekibe iletiyorum.",
        knowledgeDocId: doc?.id,
        needsHandoff: !doc,
      });
    } else if (/fatura/.test(text)) {
      result = turn({
        intent: "INVOICE_REQUEST",
        confidence: 0.95,
        reply: "Fatura talebinizi ekibimize ilettim. Hangi randevunuz için fatura istediğinizi paylaşır mısınız?",
      });
    } else if (/ücret|ucret|fiyat/.test(text)) {
      result = turn({
        intent: "PRICE_REQUEST",
        confidence: 0.94,
        reply: "Güncel seans ücretini yetkili ekibimiz sizinle paylaşacak. Hangi hizmet veya uzman için fiyat bilgisi almak istersiniz?",
      });
    } else if (/geleceğim|geliyorum|teyit/.test(text)) {
      result = turn({
        intent: "CONFIRM",
        confidence: 0.93,
        reply: "Teşekkürler, randevunuzu teyit ettim. Görüşmek üzere.",
      });
    } else if (/iptal/.test(text)) {
      result = turn({
        intent: "CANCEL",
        confidence: 0.94,
        reply: "İptal talebinizi aldım. Onaylandığında size haber vereceğim.",
        entities: { therapistName: "Psikolog & Aile Danışmanı Hazal Gül Akkuş" },
      });
    } else if (/saat|ertele|değiştir|başka gün/.test(text)) {
      result = turn({
        intent: "RESCHEDULE",
        confidence: 0.9,
        reply: "Uygun saatleri kontrol edip size 2–3 seçenek önereceğim.",
      });
    } else if (/yeni randevu|randevu almak/.test(text)) {
      result = turn({
        intent: "NEW_BOOKING",
        confidence: 0.89,
        reply: "Yeni randevu için uygun saatleri kontrol ediyorum.",
      });
    } else {
      result = turn({
        intent: "UNKNOWN",
        confidence: 0.41,
        reply: "Randevu, mevcut saatiniz, iptal veya klinik bilgisi için yazabilirsiniz. Hangisi size uygun?",
        needsHandoff: false,
        handoffReason: "Düşük güven",
      });
    }

    return {
      turn: result,
      latencyMs: 0,
      model: "fake",
      provider: "fake" as const,
    };
  }
}
