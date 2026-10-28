import { z } from "zod";
import { MODEL_VERSION_LABEL } from "@/lib/llm/types";
import type { SimulationFixture } from "@/lib/simulator/rules";

export const simulationScenarioSchema = z.enum([
  "future_cancel",
  "confirm",
  "same_day_cancel",
  "reschedule",
  "new_booking",
  "clinic_info",
  "missing_knowledge",
  "unknown",
  "sensitive",
  "therapist_change",
  "two_people",
  "calendar_down",
  "model_fail",
]);

export const simulationConditionsSchema = z.object({
  scenario: simulationScenarioSchema.default("future_cancel"),
  patientSetup: z.enum(["single", "two_people"]).default("single"),
  calendar: z.enum(["available", "unavailable"]).default("available"),
  nowAt: z.string().min(1),
  provider: z.enum(["openai", "fake"]).default("openai"),
  modelVersion: z.string().min(1).default(MODEL_VERSION_LABEL),
});

export type SimulationConditions = z.infer<typeof simulationConditionsSchema>;

export function defaultConditions(
  now = new Date(),
  provider: SimulationConditions["provider"] = "openai",
): SimulationConditions {
  return simulationConditionsSchema.parse({
    scenario: "future_cancel",
    patientSetup: "single",
    calendar: "available",
    nowAt: now.toISOString(),
    provider,
    modelVersion: MODEL_VERSION_LABEL,
  });
}

export function buildFixture(conditions: SimulationConditions): SimulationFixture {
  const now = new Date(conditions.nowAt);
  const laterToday = new Date(now);
  laterToday.setHours(15, 30, 0, 0);
  if (laterToday.getTime() <= now.getTime()) {
    laterToday.setDate(laterToday.getDate() + 1);
    laterToday.setHours(15, 30, 0, 0);
  }
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  inSevenDays.setHours(15, 30, 0, 0);
  const second = new Date(now.getTime() + 13 * 24 * 60 * 60 * 1000);
  second.setHours(18, 0, 0, 0);

  const sameDay =
    conditions.scenario === "same_day_cancel" || conditions.patientSetup === "two_people";
  const two = conditions.patientSetup === "two_people" || conditions.scenario === "two_people";

  const appointments = [
    {
      id: "sim_appt_1",
      patientName: "Test Hasta",
      therapistName: "Psikolog & Aile Danışmanı Hazal Gül Akkuş",
      startAt: sameDay && !two ? laterToday : inSevenDays,
      endAt: new Date((sameDay && !two ? laterToday : inSevenDays).getTime() + 50 * 60 * 1000),
    },
  ];
  if (two) {
    appointments.push({
      id: "sim_appt_2",
      patientName: "Test Yakın",
      therapistName: "Klinik Psikolog Merve Nur Akıl",
      startAt: second,
      endAt: new Date(second.getTime() + 50 * 60 * 1000),
    });
  }

  return {
    patients: two
      ? [
          { name: "Test Hasta", phone: "+905550000000" },
          { name: "Test Yakın", phone: "+905550000000" },
        ]
      : [{ name: "Test Hasta", phone: "+905550000000" }],
    appointments,
  };
}

export function appointmentsSummary(fixture: SimulationFixture): string {
  return fixture.appointments
    .map(
      (item) =>
        `${item.patientName} · ${item.therapistName} · ${item.startAt.toISOString()}–${item.endAt.toISOString()}`,
    )
    .join("\n");
}

export const SCENARIO_OPTIONS: Array<{ value: SimulationConditions["scenario"]; label: string }> = [
  { value: "future_cancel", label: "Gelecek tarihli iptal talebi" },
  { value: "confirm", label: "Randevu teyidi" },
  { value: "same_day_cancel", label: "Aynı gün iptal (saat geçmemiş)" },
  { value: "reschedule", label: "Saat değişikliği · uygun saat önerisi" },
  { value: "new_booking", label: "Yeni randevu talebi" },
  { value: "clinic_info", label: "Klinik bilgisi · onaylı içerik" },
  { value: "missing_knowledge", label: "Bilgi havuzunda yanıt yok" },
  { value: "unknown", label: "Belirsiz mesaj · düşük güven" },
  { value: "sensitive", label: "Hassas / acil konu" },
  { value: "therapist_change", label: "Terapist değişikliği talebi" },
  { value: "two_people", label: "Aynı numarada iki kişi" },
  { value: "calendar_down", label: "Takvim erişimi yok" },
  { value: "model_fail", label: "Model çağrısı başarısız" },
];

export const PRESET_CHIPS: Array<{ label: string; text: string }> = [
  { label: "Geleceğim", text: "Geleceğim, teşekkürler." },
  { label: "Bugünkü randevumu iptal", text: "Bugünkü randevumu iptal etmek istiyorum." },
  { label: "Saati değiştirebilir miyiz", text: "Saati değiştirebilir miyiz, akşamları daha uygun." },
  { label: "Belirsiz mesaj", text: "Aslında tam emin değilim yani." },
];
