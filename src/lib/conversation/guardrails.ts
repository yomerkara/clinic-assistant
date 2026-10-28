const ABUSE =
  /\b(gerizekal[ıi]|salak|aptal|orospu|siktir|amk|aq\b|piç|pic\b|kahpe|serefsiz|şerefsiz|göt|ibne)\b/i;

const CRISIS =
  /intihar|kendimi öldür|kendime zarar|acil tıbbi|hayati tehlike|kriz halindeyim/i;

const HUMAN =
  /müşteri temsilcisi|canlı destek|birinizle konuş|insanla konuş|çalışanla konuş|çalışanla görüş|danışmanla konuş|bir insanla|operatöre bağla|temsilci(?:ye|yle)? konuş|bir çalışan/i;

export function isCrisisMessage(text: string) {
  return CRISIS.test(text);
}

export function isAbuseMessage(text: string) {
  return ABUSE.test(text) && !isCrisisMessage(text);
}

export function isHumanRequest(text: string) {
  return HUMAN.test(text);
}

function folded(text: string) {
  return text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isConversationClosing(text: string) {
  const value = folded(text);
  return /^(tamam(dir)?|peki|anlastik|tesekkur(ler| ederim)?|cok tesekkur(ler| ederim)?|sag ol(un)?|gorusuruz|tamam(dir)? tesekkur(ler| ederim)?|tamam(dir)? sag ol(un)?)$/.test(
    value,
  );
}

export const ABUSE_REPLY =
  "Bu üslupla devam edemiyorum. Randevu veya klinik bilgi için yazabilir, ya da çalışanla görüşmeyi isteyebilirsiniz.";
