export const INTAKE_QUESTIONS = {
  name: "Randevu için adınızı ve soyadınızı paylaşır mısınız?",
  surname: "Soyadınızı da paylaşır mısınız?",
  sessionMode: "Seansı online mı, yüz yüze mi tercih edersiniz?",
  age: "Yaşınızı paylaşır mısınız?",
  therapyHistory: "Daha önce terapi deneyiminiz oldu mu?",
  therapist:
    "Hangi terapistimizle görüşmek istersiniz? Terapistlerimizi tanımıyorsanız çalışma alanlarını kısaca anlatabilirim.",
  availability: "Randevu için hangi gün ve saatler size uygun?",
} as const;

export type BookingStage =
  | "GREETING"
  | "INTAKE"
  | "THERAPIST_PREFERENCE"
  | "AVAILABILITY"
  | "SLOT_SELECTION"
  | "PENDING_APPROVAL"
  | "CONFIRMED";
export type BookingFlowInput = {
  requested: boolean;
  intake?: {
    hasFullName: boolean;
    givenName?: string;
    sessionModeConfirmed?: boolean;
    age: number | null;
    hasTherapyHistory: boolean | null;
    availabilityNotes: string | null;
  };
  therapistSelected: boolean;
  pendingApproval?: boolean;
  slotsOffered?: boolean;
  confirmed?: boolean;
};
export function bookingFlow(input: BookingFlowInput): {
  stage: BookingStage;
  question: string | null;
} {
  if (input.confirmed) return { stage: "CONFIRMED", question: null };
  if (!input.requested) return { stage: "GREETING", question: null };
  if (input.intake) {
    const question = !input.intake.hasFullName
      ? input.intake.givenName
        ? INTAKE_QUESTIONS.surname
        : INTAKE_QUESTIONS.name
      : input.intake.age == null
        ? INTAKE_QUESTIONS.age
        : input.intake.hasTherapyHistory == null
          ? INTAKE_QUESTIONS.therapyHistory
          : input.intake.sessionModeConfirmed === false
            ? INTAKE_QUESTIONS.sessionMode
            : null;
    if (question) return { stage: "INTAKE", question };
  }
  if (!input.therapistSelected)
    return {
      stage: "THERAPIST_PREFERENCE",
      question: INTAKE_QUESTIONS.therapist,
    };
  if (input.intake && !input.intake.availabilityNotes?.trim())
    return {
      stage: "AVAILABILITY",
      question: INTAKE_QUESTIONS.availability,
    };
  if (input.pendingApproval) return { stage: "PENDING_APPROVAL", question: null };
  return {
    stage: input.slotsOffered ? "SLOT_SELECTION" : "AVAILABILITY",
    question: null,
  };
}
