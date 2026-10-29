// Monthly clinic figures with a month-over-month comparison and a per-therapist
// breakdown. Read-only: every number comes from existing rows, and a session is
// counted on the day it was held, not the day the request arrived.
import { prisma } from "@/lib/prisma";
import { clinicMonth, compare, type Change, type Period } from "./period";

export type { Change } from "./period";

export type Metric = {
  key: string;
  label: string;
  hint: string;
  current: number;
  previous: number;
  change: Change;
};

export type TherapistRow = {
  therapistId: string;
  displayName: string;
  held: number;
  previousHeld: number;
  change: Change;
  cancelled: number;
  upcoming: number;
  newPatients: number;
};

export type ClinicStatistics = {
  current: Period;
  previous: Period;
  metrics: Metric[];
  therapists: TherapistRow[];
  /** True when nothing happened in either month, so the page can say so. */
  empty: boolean;
};

const HELD = ["COMPLETED", "CONFIRMED"] as const;

async function countAppointments(period: Period, where: object = {}) {
  return prisma.appointment.count({
    where: { startAt: { gte: period.from, lt: period.to }, ...where },
  });
}

async function countActions(period: Period, type: "INVOICE_REQUEST" | "PRICE_REQUEST") {
  return prisma.actionRequest.count({
    where: { type, createdAt: { gte: period.from, lt: period.to } },
  });
}

export async function loadClinicStatistics(now = new Date()): Promise<ClinicStatistics> {
  const current = clinicMonth(now);
  const previous = clinicMonth(now, 1);

  const [
    newPatients,
    previousNewPatients,
    held,
    previousHeld,
    cancelled,
    previousCancelled,
    invoices,
    previousInvoices,
    prices,
    previousPrices,
    bookings,
    previousBookings,
    inboundMessages,
    previousInboundMessages,
    handoffs,
    previousHandoffs,
  ] = await Promise.all([
    prisma.patient.count({ where: { createdAt: { gte: current.from, lt: current.to } } }),
    prisma.patient.count({
      where: { createdAt: { gte: previous.from, lt: previous.to } },
    }),
    countAppointments(current, { status: { in: HELD } }),
    countAppointments(previous, { status: { in: HELD } }),
    countAppointments(current, { status: "CANCELLED" }),
    countAppointments(previous, { status: "CANCELLED" }),
    countActions(current, "INVOICE_REQUEST"),
    countActions(previous, "INVOICE_REQUEST"),
    countActions(current, "PRICE_REQUEST"),
    countActions(previous, "PRICE_REQUEST"),
    prisma.actionRequest.count({
      where: { type: "NEW_BOOKING", createdAt: { gte: current.from, lt: current.to } },
    }),
    prisma.actionRequest.count({
      where: { type: "NEW_BOOKING", createdAt: { gte: previous.from, lt: previous.to } },
    }),
    // Conversation has no creation timestamp, so message volume is counted
    // instead of inventing a "new conversation" figure the data cannot support.
    prisma.message.count({
      where: {
        direction: "INBOUND",
        createdAt: { gte: current.from, lt: current.to },
      },
    }),
    prisma.message.count({
      where: {
        direction: "INBOUND",
        createdAt: { gte: previous.from, lt: previous.to },
      },
    }),
    prisma.conversation.count({
      where: { mode: "HUMAN", lastMessageAt: { gte: current.from, lt: current.to } },
    }),
    prisma.conversation.count({
      where: { mode: "HUMAN", lastMessageAt: { gte: previous.from, lt: previous.to } },
    }),
  ]);

  const metrics: Metric[] = [
    {
      key: "newPatients",
      label: "Yeni müşteri",
      hint: "Bu ay ilk kez kaydı açılan kişi sayısı.",
      current: newPatients,
      previous: previousNewPatients,
      change: compare(newPatients, previousNewPatients),
    },
    {
      key: "held",
      label: "Gerçekleşen seans",
      hint: "Tamamlanan ve katılımı teyit edilen randevular, seans gününe göre.",
      current: held,
      previous: previousHeld,
      change: compare(held, previousHeld),
    },
    {
      key: "bookings",
      label: "Randevu talebi",
      hint: "Asistan üzerinden açılan yeni randevu talepleri.",
      current: bookings,
      previous: previousBookings,
      change: compare(bookings, previousBookings),
    },
    {
      key: "cancelled",
      label: "İptal",
      hint: "İptal edilen randevular, seans gününe göre.",
      current: cancelled,
      previous: previousCancelled,
      change: compare(cancelled, previousCancelled),
    },
    {
      key: "invoices",
      label: "Fatura talebi",
      hint: "Hastaların fatura istekleri.",
      current: invoices,
      previous: previousInvoices,
      change: compare(invoices, previousInvoices),
    },
    {
      key: "prices",
      label: "Ücret sorusu",
      hint: "Ücret bilgisi istenen konuşmalar.",
      current: prices,
      previous: previousPrices,
      change: compare(prices, previousPrices),
    },
    {
      key: "inboundMessages",
      label: "Gelen mesaj",
      hint: "Hastalardan bu ay gelen mesaj sayısı.",
      current: inboundMessages,
      previous: previousInboundMessages,
      change: compare(inboundMessages, previousInboundMessages),
    },
    {
      key: "handoffs",
      label: "Çalışana devredilen",
      hint: "Şu an çalışanda olan ve bu ay mesaj alan konuşmalar.",
      current: handoffs,
      previous: previousHandoffs,
      change: compare(handoffs, previousHandoffs),
    },
  ];

  const therapistProfiles = await prisma.therapistProfile.findMany({
    where: { active: true, user: { active: true } },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  const therapists: TherapistRow[] = await Promise.all(
    therapistProfiles.map(async (profile) => {
      const [heldNow, heldBefore, cancelledNow, upcoming, newForTherapist] =
        await Promise.all([
          countAppointments(current, { therapistId: profile.id, status: { in: HELD } }),
          countAppointments(previous, { therapistId: profile.id, status: { in: HELD } }),
          countAppointments(current, { therapistId: profile.id, status: "CANCELLED" }),
          prisma.appointment.count({
            where: {
              therapistId: profile.id,
              status: { in: ["SCHEDULED", "CONFIRMED"] },
              startAt: { gte: now },
            },
          }),
          prisma.patient.count({
            where: {
              createdAt: { gte: current.from, lt: current.to },
              appointments: { some: { therapistId: profile.id } },
            },
          }),
        ]);
      return {
        therapistId: profile.id,
        displayName: profile.displayName,
        held: heldNow,
        previousHeld: heldBefore,
        change: compare(heldNow, heldBefore),
        cancelled: cancelledNow,
        upcoming,
        newPatients: newForTherapist,
      };
    }),
  );

  return {
    current,
    previous,
    metrics,
    therapists,
    empty: metrics.every((metric) => metric.current === 0 && metric.previous === 0),
  };
}
