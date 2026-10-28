import type { ActionStatus, ActionType } from "@prisma/client";

const timezone = process.env.APP_TIMEZONE ?? "Europe/Istanbul";

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(date);
}

export function formatAge(from: Date, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) {
    return `${minutes} dk önce`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} saat önce`;
  }
  return `${Math.round(hours / 24)} gün önce`;
}

export function formatRemaining(until: Date, now = new Date()): string | null {
  const minutes = Math.round((until.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) {
    return "Süresi doldu";
  }
  if (minutes < 60) {
    return `Süresi doluyor: ${minutes} dk`;
  }
  return `Kalan süre: ${Math.round(minutes / 60)} sa`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) {
    return phone;
  }
  return `+${digits.slice(0, 2)} ${digits.slice(2, 3)}•• ••• ${digits.slice(-4, -2)} ${digits.slice(-2)}`;
}

export function actionTypeLabel(type: ActionType): string {
  switch (type) {
    case "NEW_BOOKING":
      return "Yeni randevu";
    case "RESCHEDULE":
      return "Saat değişikliği";
    case "CANCEL":
      return "İptal";
    case "CONFIRM":
      return "Teyit";
    case "THERAPIST_CHANGE":
      return "Terapist değişikliği";
    case "PRICE_REQUEST":
      return "Fiyat bilgisi";
    case "INVOICE_REQUEST":
      return "Fatura talebi";
    default:
      return type;
  }
}

export function actionStatusLabel(status: ActionStatus): string {
  switch (status) {
    case "PENDING":
      return "Onay bekliyor";
    case "NEEDS_RECHECK":
      return "Yeniden kontrol";
    case "AUTO_APPLIED":
      return "Otomatik uygulandı";
    case "APPROVED":
      return "Onaylandı";
    case "REJECTED":
      return "Reddedildi";
    case "EXPIRED":
      return "Süresi doldu";
    default:
      return status;
  }
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function roleLabel(role: string): string {
  switch (role) {
    case "INTERN":
      return "Stajyer";
    case "THERAPIST":
      return "Terapist";
    case "ADMIN":
      return "Yönetici";
    default:
      return role;
  }
}
