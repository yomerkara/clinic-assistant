import { describe, expect, it } from "vitest";
import { formatPatientName, missingBookingProfile } from "./profile";
describe("patient profile invariant", () => {
  it("requires separately recorded guardian approval and accompaniment for minors", () => {
    const child = {
      displayName: "ayşe örnek",
      age: 15,
      hasTherapyHistory: false,
      availabilityNotes: "Salı 15",
    };
    expect(missingBookingProfile(child)).toEqual([
      "veli adı ve soyadı",
      "veli onayı",
      "veli eşlik teyidi",
    ]);
    expect(
      missingBookingProfile({
        ...child,
        guardianName: "Ali Örnek",
        guardianConsent: true,
        guardianAccompanies: false,
      }),
    ).toEqual(["veli eşlik teyidi"]);
    expect(
      missingBookingProfile({
        ...child,
        guardianName: "Ali Örnek",
        guardianConsent: true,
        guardianAccompanies: true,
      }),
    ).toEqual([]);
  });
  it("formats Turkish and compound names without changing storage", () => {
    expect(formatPatientName("ışıl ince")).toBe("Işıl İnce");
    expect(formatPatientName("ali kara")).toBe("Ali Kara");
    expect(formatPatientName("ayşe-nur yılmaz")).toBe("Ayşe-Nur Yılmaz");
  });
  it("accepts false therapy history but rejects every missing field", () => {
    const complete = {
      displayName: "ali kara",
      age: 27,
      hasTherapyHistory: false,
      availabilityNotes: "Salı 15",
    };
    expect(missingBookingProfile(complete)).toEqual([]);
    expect(missingBookingProfile({ ...complete, displayName: "Ali" })).toContain(
      "ad ve soyad",
    );
    expect(
      missingBookingProfile({
        ...complete,
        age: null,
        hasTherapyHistory: null,
        availabilityNotes: " ",
      }),
    ).toHaveLength(3);
  });
});
