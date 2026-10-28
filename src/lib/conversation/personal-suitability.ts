// Shared by routing and the final safety overlay so administrative availability
// questions cannot trigger a clinical handoff after routing has accepted them.
export function asksPersonalSuitability(inbound: string): boolean {
  const text = inbound
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(
      /(?:bilgi(?:si|leri|sini|lerini)?|randevu|fiyat|ucret|fatura)\s+alabilir miyim/gu,
      "",
    );
  return text.split(/[.!?;,]|\bbu arada\b|\bama\b|\bve\b/).some((clause) => {
    const asksFit =
      /(?:bana|benim|kendim|ben|yasima|cocuguma|onun)\b.{0,60}\b(?:uygun|iyi gelir|alabilir miyim|alabiliyor muyum|gitmeli miyim)|\b(?:uygun mu|uygun olur|alabilir miyim|alabiliyor muyum|gitmeli miyim|hangi hocayla|iyi gelir)\b/.test(
        clause,
      );
    const calendar =
      /\d|yarin|bugun|saat|pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar|hafta|sabah|aksam|ogleden sonra/.test(
        clause,
      );
    const clinical =
      /emdr|terapi|yaklasim|tedavi|yasima|cocuguma|iyi gelir|hangi hocayla/.test(clause);
    return asksFit && (!calendar || clinical);
  });
}
