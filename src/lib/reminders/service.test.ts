import { describe, expect, it } from "vitest";
import { appointmentLabel, reminderText } from "@/lib/reminders/service";

describe("appointment reminders", () => {
  const startAt = new Date("2026-08-27T11:00:00.000Z");

  it("uses the real Istanbul weekday and time", () => {
    expect(appointmentLabel(startAt, "Europe/Istanbul")).toContain("27 Ağustos Perşembe");
    expect(appointmentLabel(startAt, "Europe/Istanbul")).toContain("14:00");
  });

  it("addresses known patients with Bey/Hanım", () => {
    expect(
      reminderText({
        patientName: "Ömer Kara",
        therapistName: "Hazal Gül Akkuş",
        startAt,
      }),
    ).toContain("Merhaba Ömer Bey,");
    expect(
      reminderText({
        patientName: "Ayşe Yıldırım",
        therapistName: "Merve Nur Akıl",
        startAt,
      }),
    ).toContain("Merhaba Ayşe Hanım,");
  });
});
