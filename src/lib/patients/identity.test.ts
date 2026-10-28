import { describe, expect, it } from "vitest";
import {
  findPatientByName,
  mentionsAnotherPerson,
  shouldAskWhoTheAppointmentIsFor,
} from "@/lib/patients/identity";

const patients = [
  { name: "Ayşe Yıldırım", phone: "+905550000000" },
  { name: "Mehmet Yıldırım", phone: "+905550000000" },
];

describe("patient identity", () => {
  it("recognizes a related person mention", () => {
    expect(mentionsAnotherPerson("Eşim için randevu almak istiyorum.")).toBe(true);
  });

  it("matches an existing patient by name", () => {
    expect(findPatientByName("Mehmet Yildirim için", patients)?.name).toBe("Mehmet Yıldırım");
  });

  it("asks which person owns an ambiguous booking", () => {
    expect(
      shouldAskWhoTheAppointmentIsFor({
        text: "Yeni randevu almak istiyorum.",
        intent: "NEW_BOOKING",
        patients,
      }),
    ).toBe(true);
  });

  it("allows an explicitly named existing patient", () => {
    expect(
      shouldAskWhoTheAppointmentIsFor({
        text: "Mehmet Yıldırım için yeni randevu istiyorum.",
        intent: "NEW_BOOKING",
        patients,
      }),
    ).toBe(false);
  });
});
