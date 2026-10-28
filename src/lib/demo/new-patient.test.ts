import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ conversation: { findFirst: vi.fn() }, patient: { create: vi.fn(), findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
import { createNewDemoPatient, findNewDemoPatient } from "./new-patient";
import { personaById } from "./personas";
beforeEach(() => vi.clearAllMocks());

it("starts each new conversation with a separate nameless patient and no previous intake", async () => {
  await createNewDemoPatient("admin");
  await createNewDemoPatient("admin");
  const first = db.patient.create.mock.calls[0][0].data;
  const second = db.patient.create.mock.calls[1][0].data;
  expect(first.phone).not.toBe(second.phone);
  expect(first).toEqual({ phone: expect.stringMatching(/^demo:admin:new:/), displayName: "Yeni Hasta", conversations: { create: { phone: first.phone, source: "demo", mode: "BOT" } } });
  expect(first.age).toBeUndefined();
  expect(first.hasTherapyHistory).toBeUndefined();
});

it("finds only the current administrator's new demo patients", async () => {
  await findNewDemoPatient("admin-two");
  expect(db.conversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { phone: { startsWith: "demo:admin-two:new:" }, source: "demo" } }));
});

it("does not prefill Elif or alter existing appointment personas", () => {
  const persona = personaById("new");
  expect(persona.patientId).toBeUndefined();
  expect(JSON.stringify(persona)).not.toContain("Elif");
  expect(personaById("ayse").patientId).toBe("patient_ayse");
});
