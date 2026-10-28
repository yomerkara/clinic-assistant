import { ControlIcon } from "@/components/ControlIcon";

import { DateInput } from "@/components/DateInput";
import { formatPatientName } from "@/lib/patients/profile";
import { CalendarViewIcon } from "@/components/AdminIcons";
import { CalendarAutoRefresh } from "@/components/CalendarAutoRefresh";
import { OperationNotice } from "@/components/OperationNotice";
import { patientScope } from "@/lib/auth/scope";
import { canReviewQueue } from "@/lib/auth/rbac";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { CalendarWeek, type WeekEvent } from "@/components/CalendarWeek";
import { requireUser, toActor } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listCalendarEvents } from "@/lib/calendar/google";
import { ensureDemoCalendarProfile } from "@/lib/demo/calendar-profile";
import { toIstanbulInput, parseIstanbulInput } from "@/lib/calendar/dates";
export const dynamic = "force-dynamic";
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    therapist?: string;
    view?: string;
    error?: string;
    done?: string;
  }>;
}) {
  const user = await requireUser(),
    query = await searchParams;
  const ownTestProfile =
    user.role === "ADMIN" ? await ensureDemoCalendarProfile(user.id) : null;
  const therapists = await prisma.therapistProfile.findMany({
    where: { active: true, ...(user.role === "ADMIN" ? {} : { userId: user.id }) },
    orderBy: { displayName: "asc" },
  });
  const ownCalendar = therapists.find((t) => t.userId === user.id);
  const selected =
    (query.therapist === "self"
      ? ownCalendar
      : therapists.find((t) => t.id === query.therapist)) ??
    ownCalendar ??
    therapists[0];
  const today = toIstanbulInput(new Date()).slice(0, 10);
  const validDate = Number.isFinite(parseIstanbulInput(`${query.date}T00:00`).getTime());
  const anchor = validDate ? query.date! : today,
    view = query.view === "day" ? "day" : "week",
    days = view === "day" ? 1 : 7;
  const from = new Date(`${anchor}T00:00:00+03:00`);
  if (days === 7) {
    const weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay();
    from.setUTCDate(from.getUTCDate() - ((weekday + 6) % 7));
  }
  const to = new Date(from.getTime() + days * 86400000),
    day = toIstanbulInput(from).slice(0, 10);
  const href = (date: string, v = view) =>
    `/calendar?date=${date}&therapist=${selected?.id ?? ""}&view=${v}`;
  let unavailable = false;
  const connection = selected
    ? await prisma.calendarConnection.findUnique({
        where: { userId: selected.userId },
        select: { id: true },
      })
    : null;
  const google =
    connection && selected
      ? await listCalendarEvents(selected.userId, from, to).catch(() => {
          unavailable = true;
          return [];
        })
      : [];
  const appointments = selected
    ? await prisma.appointment.findMany({
        where: {
          therapistId: selected.id,
          startAt: { lt: to },
          endAt: { gt: from },
          status: { in: ["SCHEDULED", "CONFIRMED", "COMPLETED", "NO_SHOW_REVIEW"] },
        },
        include: {
          patient: true,
          notes: { orderBy: { createdAt: "asc" } },
          actionRequests: { where: { status: "PENDING" }, take: 1 },
        },
        orderBy: { startAt: "asc" },
      })
    : [];
  const isTestCalendar = Boolean(ownTestProfile && selected?.id === ownTestProfile.id);
  const canEdit = canReviewQueue(user.role) && !isTestCalendar;
  const customers =
    selected && canEdit
      ? await prisma.patient.findMany({
          where: patientScope(toActor(user)),
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" },
        })
      : [];
  const events: WeekEvent[] = appointments.map((a) => ({
    id: a.id,
    start: a.startAt.toISOString(),
    end: a.endAt.toISOString(),
    title: `${formatPatientName(a.patient.displayName)} · ${a.sessionMode === "ONLINE" ? "Online" : "Klinikte"}`,
    sessionMode: a.sessionMode,
    status: a.status,
    completedAutomatically: Boolean(a.completedAutomaticallyAt),
    meetingUrl: a.meetingUrl,
    meetingSent: Boolean(a.meetingSentAt),
    patientId: a.patientId,
    appointmentId: a.id,
    actionId: a.actionRequests[0]?.id,
    confirmed: a.status === "CONFIRMED",
    notes: a.notes.map((n) => ({ text: n.text, synced: Boolean(n.calendarSyncedAt) })),
  }));
  events.push(
    ...google
      .filter((e) => !appointments.some((a) => a.calendarEventId === e.id))
      .map((e) => ({
        id: `google_${e.id}`,
        start: e.allDay ? `${e.start}T00:00:00+03:00` : e.start,
        end: e.allDay ? `${e.end}T00:00:00+03:00` : e.end,
        title: e.busy ? "Meşgul · Google" : "Müsait etkinlik · Google",
        allDay: e.allDay,
        external: true,
        busy: e.busy,
      })),
  );
  const caption = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(from);
  return (
    <AdminShell user={user} active="calendar">
      <CalendarAutoRefresh />
      <div className="desk-page calendar-page">
        <div className="admin-page-head">
          <div>
            <span className="admin-kicker">Randevu planı</span>
            <h1>Takvim</h1>
          </div>
        </div>
        <OperationNotice error={query.error} done={query.done} />
        <div className="calendar-toolbar">
          <nav aria-label="Takvim tarihleri">
            <Link className="admin-secondary-btn" href={href(today)}>
              Bugün
            </Link>
            <Link
              className="calendar-arrow"
              aria-label="Önceki dönem"
              href={href(
                toIstanbulInput(new Date(from.getTime() - days * 86400000)).slice(0, 10),
              )}
            >
              <ControlIcon name="previous" />
            </Link>
            <Link
              className="calendar-arrow"
              aria-label="Sonraki dönem"
              href={href(toIstanbulInput(to).slice(0, 10))}
            >
              <ControlIcon name="next" />
            </Link>
            <h2>{caption}</h2>
          </nav>
          <form method="get" className="calendar-selects">
            <label className="sr-only" htmlFor="calendar-date">
              Tarih
            </label>
            <DateInput
              id="calendar-date"
              type="date"
              name="date"
              defaultValue={anchor}
              required
            />
            {user.role === "ADMIN" ? (
              <select
                name="therapist"
                defaultValue={selected?.id}
                aria-label="Takvim sahibi"
              >
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.userId === user.id ? `Takvimim · ${t.displayName}` : t.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name="therapist" value={selected?.id ?? ""} />
            )}
            <select name="view" defaultValue={view} aria-label="Takvim görünümü">
              <option value="week">Hafta</option>
              <option value="day">Gün</option>
            </select>
            <button className="toolbar-apply-btn" type="submit">
              <CalendarViewIcon /> Takvimi göster
            </button>
          </form>
        </div>
        {!selected ? (
          <div className="admin-empty">
            Bu hesap için görüntülenebilir terapist takvimi yok.
          </div>
        ) : (
          <>
            {!connection || unavailable ? (
              <div className="calendar-status" role="status">
                <b>
                  {unavailable
                    ? "Google Takvim şu an okunamadı."
                    : "Google Takvim bağlı değil."}
                </b>{" "}
                Yalnızca uygulamadaki randevular gösteriliyor; boş alanlar müsaitlik
                garantisi vermez.{" "}
                {selected.userId === user.id && (
                  <Link href="/settings">Bağlantıyı yönet →</Link>
                )}
              </div>
            ) : (
              <p className="desk-muted">
                Google Takvim son okuma:{" "}
                {new Intl.DateTimeFormat("tr-TR", {
                  timeZone: "Europe/Istanbul",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(new Date())}
                . Sayfa açıkken 30 saniyede bir ve sekmeye dönüşte yenilenir; form
                düzenlerken bekler. Eşleştirilmemiş etkinliklerin özel içerikleri
                gösterilmez.
              </p>
            )}
            <CalendarWeek
              from={from.toISOString()}
              days={days}
              today={today}
              therapistId={selected.id}
              therapistName={selected.displayName}
              events={events}
              customers={customers}
              canEdit={canEdit}
              canSendMeeting={canReviewQueue(user.role)}
              connected={Boolean(connection && !unavailable)}
            />
            <p className="desk-muted calendar-hint">
              {isTestCalendar ? (
                "Bu takvimde test randevusu oluşturmak için demoda Yönetici Ömer ile randevu iste ve bekleyen işlemi onayla."
              ) : (
                <>
                  Saat alanına tıklayarak randevu ekleyin. Bir randevuya tıklayarak
                  müşteri bilgilerini açabilir veya saatini değiştirebilirsiniz. Hafta
                  başlangıcı: {day}.
                </>
              )}
            </p>
          </>
        )}
      </div>
    </AdminShell>
  );
}
