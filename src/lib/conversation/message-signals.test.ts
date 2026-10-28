import { describe, expect, it } from "vitest";
import {
  actsOnExistingAppointment,
  cancelsAppointmentNote,
  changesAppointment,
  reportsMissedAppointment,
  requestedSessionMode,
  requestsNewBooking,
  selectsExistingAppointment,
  wantsDifferentTime,
} from "./message-signals";

describe("requestedSessionMode", () => {
  it("reads an explicit online preference", () => {
    for (const text of [
      "online",
      "Online olsun",
      "uzaktan istiyorum",
      "randevu online olabilir mi",
      "seans online olsun",
    ])
      expect(requestedSessionMode(text)).toBe("ONLINE");
  });

  it("reads an explicit in-person preference", () => {
    for (const text of ["yüz yüze", "Yüz yüze olsun", "kliniğe gelerek yapalım"])
      expect(requestedSessionMode(text)).toBe("IN_PERSON");
  });

  it("stays unset when the patient has not chosen", () => {
    for (const text of [
      "Merhaba randevu almak istiyorum",
      "online seansları nasıl yapıyorsunuz?",
      "29",
    ])
      expect(requestedSessionMode(text)).toBeNull();
  });
});

describe("new booking versus an existing appointment", () => {
  it("treats an additional booking as a new one, never as a reschedule", () => {
    const text = "Mevcut randevum kalsın, bir tane daha randevu almak istiyorum";
    expect(requestsNewBooking(text)).toBe(true);
    expect(actsOnExistingAppointment(text)).toBe(false);
  });

  it("treats cancel and change wording as acting on the saved appointment", () => {
    for (const text of [
      "Randevumu iptal etmek istiyorum",
      "randevumu değiştirmek istiyorum",
      "iptal etmek istediğim randevu yarın",
    ]) {
      expect(actsOnExistingAppointment(text)).toBe(true);
      expect(selectsExistingAppointment(text)).toBe(true);
      expect(requestsNewBooking(text)).toBe(false);
    }
  });

  it("does not read a refusal as a booking request", () => {
    expect(requestsNewBooking("randevu almak istemiyorum, sadece bilgi")).toBe(false);
  });

  it("recognises a missed session only in the past tense", () => {
    expect(reportsMissedAppointment("dünkü randevuma gelemedim")).toBe(true);
    expect(reportsMissedAppointment("randevuma geleceğim")).toBe(false);
  });
});

describe("note and time signals", () => {
  it("detects a request for another time", () => {
    expect(wantsDifferentTime("bu saat uygun değil")).toBe(true);
    expect(wantsDifferentTime("başka gün olabilir mi")).toBe(true);
    expect(wantsDifferentTime("bu saat olur")).toBe(false);
  });

  it("detects a withdrawn note", () => {
    for (const text of ["notu iptal edin", "not eklemeyin", "not ekleme"])
      expect(cancelsAppointmentNote(text)).toBe(true);
    expect(cancelsAppointmentNote("not ekler misiniz: geç kalacağım")).toBe(false);
  });

  it("detects wording that changes the appointment itself", () => {
    expect(changesAppointment("randevumu iptal edelim")).toBe(true);
    expect(changesAppointment("randevu almak istiyorum")).toBe(true);
    expect(changesAppointment("teşekkürler")).toBe(false);
  });
});
