const RELATION_WORDS = [
  "eşim",
  "eşim için",
  "çocuğum",
  "oğlum",
  "kızım",
  "annem",
  "babam",
  "kardeşim",
  "yakınım",
  "başkası için",
];

export type PatientIdentity = { name: string; phone: string };

export function hasFullPatientName(name: string) {
  const normalized = normalizePatientName(name);
  if (!normalized || normalized.startsWith("yeni hasta")) return false;
  const parts = normalized
    .split(/\s+/)
    .filter(
      (word) => !["bey", "hanim", "bay", "bayan", "randevu", "istiyorum"].includes(word),
    );
  return parts.length >= 2;
}

export function storedPatientName(name: string) {
  return name
    .toLocaleLowerCase("tr-TR")
    .normalize("NFC")
    .replace(/[^\p{L}\s’'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Comparison only; never persist this ASCII search key as a patient's name. */
export function normalizePatientName(name: string) {
  return name
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mentionsAnotherPerson(text: string) {
  const normalized = text.toLocaleLowerCase("tr-TR");
  return RELATION_WORDS.some((word) => normalized.includes(word));
}

export function findPatientByName(text: string, patients: PatientIdentity[]) {
  const normalized = normalizePatientName(text);
  return patients.find((patient) => {
    const name = normalizePatientName(patient.name);
    return name.length > 2 && (normalized.includes(name) || name.includes(normalized));
  });
}

export function shouldAskWhoTheAppointmentIsFor(input: {
  text: string;
  intent: "CONFIRM" | "CANCEL" | "RESCHEDULE" | "NEW_BOOKING";
  patients: PatientIdentity[];
}) {
  if (input.intent !== "NEW_BOOKING" && input.patients.length < 2) {
    return false;
  }
  if (findPatientByName(input.text, input.patients)) {
    return false;
  }
  if (mentionsAnotherPerson(input.text)) {
    return true;
  }
  return input.patients.length > 1;
}

export function identityQuestion(patients: PatientIdentity[]) {
  if (patients.length > 1) {
    return "Bu numarada birden fazla kişi görüyorum. İşlem kimin için olacak? Lütfen kişinin adını ve soyadını yazar mısınız?";
  }
  return "Elbette. Randevu kimin için olacak? Kişinin adını ve soyadını paylaşır mısınız?";
}
