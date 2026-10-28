import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createInboundBufferService, nextDue } from "./inbound-buffer";
import { introducedName } from "@/lib/simulator/scope";
const url = process.env.TEST_DATABASE_URL;
if (url && url === process.env.DATABASE_URL)
  throw new Error("Separate test database required");
it("resets the quiet deadline, caps bursts, and expedites sensitive messages", () => {
  const first = new Date(0);
  expect(nextDue(first, new Date(2000)).getTime()).toBe(5000);
  expect(nextDue(first, new Date(11000)).getTime()).toBe(12000);
  expect(nextDue(first, new Date(2000), true).getTime()).toBe(2000);
});
it("does not take the next message's first word as a surname", () => {
  expect(introducedName("selam\nben ömer\nterapi ücretlerini öğrenmek istiyorum")).toBe(
    "Ömer",
  );
});
describe.skipIf(!url)("durable inbound buffer", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const patientIds: string[] = [];
  let clock = new Date("2026-10-05T10:00:00Z");
  async function setup(
    handle = vi.fn<(input: import("./inbound-buffer").BufferedTurn) => Promise<void>>(
      async () => {},
    ),
  ) {
    const patient = await prisma.patient.create({
      data: { phone: `buffer:${crypto.randomUUID()}`, displayName: "test hasta" },
    });
    patientIds.push(patient.id);
    const service = createInboundBufferService({ prisma, handle, now: () => clock });
    const input = {
      patientId: patient.id,
      phone: patient.phone,
      source: "demo" as const,
      text: "selam",
      providerMessageId: crypto.randomUUID(),
    };
    return { patient, service, handle, input };
  }
  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.$disconnect();
  });
  it("combines rapid messages, deduplicates delivery and survives a service restart", async () => {
    const { service, handle, input } = await setup();
    await service.enqueue(input);
    await service.enqueue(input);
    clock = new Date(clock.getTime() + 1000);
    await service.enqueue({
      ...input,
      text: "ben ömer",
      providerMessageId: crypto.randomUUID(),
    });
    clock = new Date(clock.getTime() + 1000);
    const last = await service.enqueue({
      ...input,
      text: "terapi ücretlerini öğrenecektim",
      providerMessageId: crypto.randomUUID(),
    });
    expect(await service.drain()).toEqual([]);
    clock = new Date(clock.getTime() + 3001);
    const restarted = createInboundBufferService({ prisma, handle, now: () => clock });
    await Promise.all([restarted.drain(), restarted.drain()]);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0]?.[0]).toMatchObject({
      text: "selam\nben ömer\nterapi ücretlerini öğrenecektim",
    });
    expect(
      await prisma.message.count({ where: { conversationId: last.conversationId } }),
    ).toBe(3);
    expect(
      await prisma.inboundBuffer.findUnique({
        where: { conversationId: last.conversationId },
      }),
    ).toBeNull();
  });
  it("discards a stale model turn and retries with the new message included", async () => {
    let release!: () => void;
    let entered!: () => void;
    const began = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const handle = vi.fn(async (turn: import("./inbound-buffer").BufferedTurn) => {
      calls.push(turn.text);
      if (calls.length === 1) {
        entered();
        await hold;
      }
      await turn.ensureCurrent();
    });
    const patient = await prisma.patient.create({
      data: { phone: `buffer:${crypto.randomUUID()}`, displayName: "test hasta" },
    });
    patientIds.push(patient.id);
    const service = createInboundBufferService({ prisma, handle, now: () => clock });
    const input = {
      patientId: patient.id,
      phone: patient.phone,
      source: "demo" as const,
      text: "selam",
      providerMessageId: crypto.randomUUID(),
    };
    await service.enqueue(input);
    clock = new Date(clock.getTime() + 3001);
    const processing = service.drain();
    await began;
    await service.enqueue({
      ...input,
      text: "ücret soracağım",
      providerMessageId: crypto.randomUUID(),
    });
    release();
    expect(await processing).toContain("superseded");
    clock = new Date(clock.getTime() + 3001);
    await service.drain();
    expect(calls).toEqual(["selam", "selam\nücret soracağım"]);
  });
  it("records staff-owned messages without scheduling a bot turn", async () => {
    const { service, handle, input, patient } = await setup();
    await prisma.conversation.create({
      data: {
        patientId: patient.id,
        phone: patient.phone,
        source: "demo",
        mode: "HUMAN",
      },
    });
    const received = await service.enqueue(input);
    clock = new Date(clock.getTime() + 3001);
    await service.drain();
    expect(handle).not.toHaveBeenCalled();
    expect(
      await prisma.inboundBuffer.findUnique({
        where: { conversationId: received.conversationId },
      }),
    ).toBeNull();
  });
});
