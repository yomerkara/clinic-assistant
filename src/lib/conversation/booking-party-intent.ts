import { normalizePatientName } from "@/lib/patients/identity";

/** Negation belongs to the named option, not the whole message. Ambiguity asks again. */
export function bookingPartyKind(text: string): "COUPLE" | "INDIVIDUAL" | null {
  const value = normalizePatientName(text);
  const choices: Array<"COUPLE" | "INDIVIDUAL"> = [];
  const mentions = [...value.matchAll(/\b(cift(?: terapisi| terapisine| seansi)?|birlikte|tek(?: bir)? seans|(?:iki|2)(?: ayri)?(?: bireysel)? seans|ayri(?: ayri)?(?: bireysel)?(?: seans)?|bireysel(?: seans)?)\b/g)];
  for (let i = 0; i < mentions.length; i++) {
    const match = mentions[i]!;
    const following = value.slice(match.index! + match[0].length, mentions[i + 1]?.index);
    if (/^\s*(?:(?:olmasini|olmak|olarak)\s+)?(?:degil|istemiyor\w*|istemem|olmasin|yerine)\b/.test(following)) continue;
    choices.push(/^(cift|birlikte|tek)/.test(match[0]) ? "COUPLE" : "INDIVIDUAL");
  }
  const unique = [...new Set(choices)];
  return unique.length === 1 ? unique[0]! : null;
}

export function partyTherapist<T extends { displayName: string }>(text: string, roster: T[]): T | undefined {
  const value = normalizePatientName(text);
  const words = new Set(value.split(" "));
  const titles = new Set(["yonetici", "test", "klinik", "psikolog", "aile", "danismani"]);
  const matches = roster.filter(person => {
    const names = normalizePatientName(person.displayName).split(" ").filter(n => n.length > 2 && !titles.has(n));
    return names.some(name => words.has(name) && !new RegExp(`\\b${name}(?: hanim| bey)? degil\\b`).test(value));
  });
  return matches.length === 1 ? matches[0] : undefined;
}
