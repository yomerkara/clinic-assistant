// Text-level signals the inbound orchestrator reads before any model call.
// They used to be inline regular expressions inside handleInbound, where they
// could not be unit tested; the patterns here are unchanged.
import { normalizePatientName } from "@/lib/patients/identity";
import { additionalBookingText, rescheduleParts } from "./appointment-lookup";

export type SessionModeRequest = "ONLINE" | "IN_PERSON" | null;

/** An explicit online / in-person preference stated by the patient. */
export function requestedSessionMode(text: string): SessionModeRequest {
  const value = normalizePatientName(text);
  if (
    /^(?:online|uzaktan)$|(?:online|uzaktan).{0,30}(?:olsun|istiyorum|yapalim|randevu)|(?:randevu|seans).{0,30}online/.test(
      value,
    )
  )
    return "ONLINE";
  if (
    /^(?:yuz yuze|yuz yuze olsun)$|(?:yuz yuze|klinige gelerek).{0,30}(?:olsun|istiyorum|yapalim)/.test(
      value,
    )
  )
    return "IN_PERSON";
  return null;
}

/** The patient says they could not attend a session that has already passed. */
export function reportsMissedAppointment(text: string): boolean {
  return /randevu.{0,60}(?:gelemedim|katilamadim|kacirdim)|(?:gelemedim|katilamadim).{0,40}randevu/.test(
    normalizePatientName(text),
  );
}

/** A request for a further appointment must never be read as a reschedule. */
export function requestsNewBooking(text: string): boolean {
  if (additionalBookingText(text)) return true;
  return (
    /(?:yeni|ikinci|bir daha|bir tane daha)\s+(?:bir\s+)?randevu(?=[\s,.!?;:]|$)|randevu (?:almak|alabilir|alac|alic|oluştur|ayarla)|randevum kalsın.{0,70}(?:bir tane daha|bir daha|ikinci|randevu daha)/iu.test(
      text,
    ) && !/iptal|değiştir|ertele|istemiyorum|randevu alma\b/iu.test(text)
  );
}

/** The message acts on an appointment the patient already has. */
export function actsOnExistingAppointment(text: string): boolean {
  if (additionalBookingText(text)) return false;
  return (
    Boolean(rescheduleParts(text)) ||
    reportsMissedAppointment(text) ||
    /randevu(?:mu|m|yu)?.*(?:iptal|değiştir|ertele)|(?:iptal|değiştir|ertele).*randevu/iu.test(
      text,
    )
  );
}

/** Used when choosing which saved appointment a cancel or change refers to. */
export function selectsExistingAppointment(text: string): boolean {
  return (
    Boolean(rescheduleParts(text)) ||
    reportsMissedAppointment(text) ||
    /randevu.*(?:iptal|degistir|ertele)|(?:iptal|degistir|ertele).*randevu/.test(
      normalizePatientName(text),
    )
  );
}

/** The patient asks for a different time than the one under discussion. */
export function wantsDifferentTime(text: string): boolean {
  return /saat uygun değil|başka saat|başka bir saat|başka gün/.test(
    text.toLocaleLowerCase("tr-TR"),
  );
}

/** A note request is dropped when the patient takes it back or changes the appointment. */
export function cancelsAppointmentNote(text: string): boolean {
  return /(?:notu|not eklemekten).*(?:vazgeç|iptal)|not eklemeyin|not ekleme(?:[.!\s]*$)/i.test(
    text,
  );
}

export function changesAppointment(text: string): boolean {
  return /iptal|vazgeç|değiştir|ertelemek|ertele|randevu al/iu.test(text);
}
