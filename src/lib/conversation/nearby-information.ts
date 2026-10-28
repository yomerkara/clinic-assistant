// A nearby business is not clinic information, even if an LLM labels it so.
export function asksNearbyFood(text: string) {
  return (
    /dönerci|donerci|restoran|restaurant|lokanta|kafe|yemek (?:yi|ye)/iu.test(text) &&
    /var\s*m[ıi]|öner|oner|nerede|nereden|yiy|yemek ye/iu.test(text)
  );
}

export function hasExplicitClinicQuestion(text: string) {
  return /adres|konum|harita|çalışma saat|calisma saat|kaçta aç|kaçta kapan|klinik (?:bilgisi|hakkında)|klini[kğ].{0,15}nerede/iu.test(
    text,
  );
}

export const NEARBY_FOOD_REPLY =
  "Yakındaki yeme içme yerleri hakkında doğrulanmış bilgim yok; harita uygulamasından bakabilirsiniz.";
