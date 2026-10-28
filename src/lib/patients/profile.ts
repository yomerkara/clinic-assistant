import { hasFullPatientName } from "./identity";

export function formatPatientName(name: string) {
  return name
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(
      /(^|[\s’'’\-])([\p{L}])/gu,
      (_, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase("tr-TR"),
    );
}

export function missingBookingProfile(patient: {
  displayName: string;
  age: number | null;
  hasTherapyHistory: boolean | null;
  availabilityNotes: string | null;
  guardianName?: string | null;
  guardianConsent?: boolean | null;
  guardianAccompanies?: boolean | null;
}) {
  return [
    !hasFullPatientName(patient.displayName) ? "ad ve soyad" : null,
    patient.age == null ? "yaş" : null,
    patient.hasTherapyHistory == null ? "terapi geçmişi" : null,
    !patient.availabilityNotes?.trim() ? "uygun gün ve saatler" : null,
    patient.age != null && patient.age < 18 && !patient.guardianName?.trim()
      ? "veli adı ve soyadı"
      : null,
    patient.age != null && patient.age < 18 && patient.guardianConsent !== true
      ? "veli onayı"
      : null,
    patient.age != null && patient.age < 18 && patient.guardianAccompanies !== true
      ? "veli eşlik teyidi"
      : null,
  ].filter((field): field is string => field !== null);
}
