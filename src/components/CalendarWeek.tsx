"use client";

import { ControlIcon } from "@/components/ControlIcon";

import { DateInput } from "@/components/DateInput";
import { formatPatientName } from "@/lib/patients/profile";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toIstanbulInput } from "@/lib/calendar/dates";
import { layoutBlocks } from "@/lib/calendar/layout";
export type WeekEvent = {
  id: string;
  start: string;
  end: string;
  title: string;
  allDay?: boolean;
  external?: boolean;
  busy?: boolean;
  patientId?: string;
  appointmentId?: string;
  actionId?: string;
  confirmed?: boolean;
  sessionMode?: string;
  status?: string;
  completedAutomatically?: boolean;
  meetingUrl?: string | null;
  meetingSent?: boolean;
  notes?: Array<{ text: string; synced: boolean }>;
};
type Props = {
  from: string;
  days: number;
  today: string;
  therapistId: string;
  therapistName: string;
  events: WeekEvent[];
  customers: Array<{ id: string; displayName: string }>;
  canEdit: boolean;
  canSendMeeting?: boolean;
  connected: boolean;
};
const hourHeight = 64;
const time = (value: string) => toIstanbulInput(value).slice(11);
export function CalendarWeek({
  from,
  days,
  today,
  therapistId,
  therapistName,
  events,
  customers,
  canEdit,
  canSendMeeting,
  connected,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState<{
    event?: WeekEvent;
    start: string;
    end: string;
    requestId: string;
  } | null>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 8 * hourHeight;
  }, [from, days]);
  const dayStarts = Array.from(
    { length: days },
    (_, i) => new Date(new Date(from).getTime() + i * 86400000),
  );
  function open(event?: WeekEvent, start = toIstanbulInput(new Date(from))) {
    const end = event?.end
      ? toIstanbulInput(event.end)
      : toIstanbulInput(new Date(new Date(`${start}:00+03:00`).getTime() + 50 * 60000));
    setSelection({
      event,
      start: event ? toIstanbulInput(event.start) : start,
      end,
      requestId: crypto.randomUUID(),
    });
    dialog.current?.showModal();
  }
  return (
    <>
      <div className="week-actions">
        <span>
          <i className="week-key" /> Müşteri randevusu <i className="week-key external" />{" "}
          Google etkinliği
        </span>
        <button
          type="button"
          className="admin-primary-btn"
          disabled={!canEdit}
          onClick={() => open(undefined, `${today}T10:00`)}
        >
          <ControlIcon name="plus" /> Randevu ekle
        </button>
      </div>
      <div
        className="week-scroll"
        ref={scroller}
        tabIndex={0}
        aria-label="Saatli takvim, yatay ve dikey kaydırılabilir"
      >
        <div className="week-canvas" style={{ minWidth: days === 1 ? 350 : 900 }}>
          <div
            className="week-head"
            style={{ gridTemplateColumns: `64px repeat(${days},minmax(0,1fr))` }}
          >
            <div className="week-zone">GMT+03</div>
            {dayStarts.map((d) => {
              const date = toIstanbulInput(d).slice(0, 10);
              return (
                <div
                  className={`week-day ${date === today ? "is-today" : ""}`}
                  key={date}
                >
                  <span>
                    {new Intl.DateTimeFormat("tr-TR", {
                      weekday: "short",
                      timeZone: "Europe/Istanbul",
                    }).format(d)}
                  </span>
                  <b>{Number(date.slice(-2))}</b>
                  <div className="week-allday">
                    {events
                      .filter(
                        (e) =>
                          e.allDay &&
                          new Date(e.start) < new Date(d.getTime() + 86400000) &&
                          new Date(e.end) > d,
                      )
                      .map((e) => (
                        <button type="button" key={e.id} onClick={() => open(e)}>
                          {e.title}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="week-hours"
            style={{
              gridTemplateColumns: `64px repeat(${days},minmax(0,1fr))`,
              height: 24 * hourHeight,
            }}
          >
            <div className="week-times">
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} style={{ top: h * hourHeight }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {dayStarts.map((d) => {
              const date = toIstanbulInput(d).slice(0, 10);
              const low = d.getTime(),
                high = low + 86400000;
              const blocks = layoutBlocks(
                events
                  .filter(
                    (e) =>
                      !e.allDay &&
                      new Date(e.start).getTime() < high &&
                      new Date(e.end).getTime() > low,
                  )
                  .map((e) => ({
                    ...e,
                    start: Math.max(low, new Date(e.start).getTime()),
                    end: Math.min(high, new Date(e.end).getTime()),
                    original: e,
                  })),
              );
              return (
                <div className="week-column" key={date}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <button
                      className="week-slot"
                      type="button"
                      key={h}
                      style={{ top: h * hourHeight, height: hourHeight }}
                      disabled={!canEdit}
                      aria-label={`${date} ${h}:00 randevu ekle`}
                      onClick={() =>
                        open(undefined, `${date}T${String(h).padStart(2, "0")}:00`)
                      }
                    />
                  ))}
                  {blocks.map((b) => (
                    <button
                      type="button"
                      key={b.id}
                      className={`week-event ${b.original.external ? "is-external" : ""} ${b.original.busy === false ? "is-free" : ""}`}
                      style={{
                        top: ((b.start - low) / 3600000) * hourHeight,
                        height: Math.max(
                          20,
                          ((b.end - b.start) / 3600000) * hourHeight - 2,
                        ),
                        left: `${(b.lane * 100) / b.lanes}%`,
                        width: `calc(${100 / b.lanes}% - 3px)`,
                      }}
                      onClick={() => open(b.original)}
                      title={`${b.original.title} · ${time(b.original.start)}–${time(b.original.end)}`}
                    >
                      <strong>
                        {b.original.title}
                        {b.original.notes?.length ? " · Not var" : ""}
                      </strong>
                      <small>
                        {time(b.original.start)}–{time(b.original.end)}
                      </small>
                      {b.original.actionId && <small>Talep bekliyor</small>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="calendar-dialog"
        onClose={() => setSelection(null)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        {selection && (
          <>
            <header>
              <div>
                <span className="admin-kicker">
                  {selection.event?.external
                    ? "Google Takvim"
                    : selection.event
                      ? "Randevu detayı"
                      : "Yeni randevu"}
                </span>
                <h2>{selection.event?.title ?? "Randevu oluştur"}</h2>
              </div>
              <button
                type="button"
                className="admin-secondary-btn"
                aria-label="Kapat"
                onClick={() => dialog.current?.close()}
              >
                <ControlIcon name="close" />
              </button>
            </header>
            <p>{therapistName}</p>
            {selection.event?.status === "COMPLETED" && (
              <p>
                {selection.event.completedAutomatically
                  ? "Tamamlandı · Seansın bitiş saati geçtiği için otomatik işaretlendi."
                  : "Tamamlandı"}
              </p>
            )}
            {selection.event?.status === "NO_SHOW_REVIEW" && (
              <p>Gelmeme durumu çalışan incelemesinde.</p>
            )}
            <p className="desk-muted">İstanbul saati (UTC+3)</p>
            {selection.event?.patientId && (
              <p>
                <Link href={`/patients/${selection.event.patientId}`}>
                  Müşteri bilgilerine git →
                </Link>
              </p>
            )}
            {selection.event?.sessionMode === "ONLINE" && (
              <section aria-label="Online seans">
                <p>
                  <strong>Online · Google Meet</strong>
                </p>
                {selection.event.meetingUrl && (
                  <p>
                    <a href={selection.event.meetingUrl} target="_blank" rel="noreferrer">
                      Görüşmeye katıl ↗
                    </a>
                  </p>
                )}
                <p>
                  {selection.event.meetingSent
                    ? "Bağlantı mesaj kanalına gönderildi; teslim teyidi henüz yok."
                    : "Bağlantı seansın 10 dakika öncesinde gönderilir."}
                </p>
                {canSendMeeting &&
                  selection.event.status !== "COMPLETED" &&
                  selection.event.status !== "NO_SHOW_REVIEW" &&
                  !selection.event.meetingSent && (
                    <form
                      action={`/api/calendar/appointments/${selection.event.appointmentId}/meeting`}
                      method="post"
                    >
                      <button className="admin-primary-btn" type="submit">
                        Bağlantıyı şimdi gönder
                      </button>
                    </form>
                  )}
              </section>
            )}
            {Boolean(selection.event?.notes?.length) && (
              <section aria-label="Randevu notları">
                <h3>Randevu notları</h3>
                <ul>
                  {selection.event!.notes!.map((note, i) => (
                    <li key={i}>
                      {note.text}{" "}
                      <small>
                        {note.synced ? "Takvime aktarıldı" : "Takvime aktarım bekliyor"}
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {selection.event?.actionId && (
              <p>
                <Link href={`/queue/${selection.event.actionId}`}>
                  Bekleyen talebi incele →
                </Link>
              </p>
            )}
            {selection.event?.external ? (
              <>
                <p>
                  {selection.event.allDay
                    ? "Tüm gün"
                    : `${time(selection.event.start)}–${time(selection.event.end)}`}
                </p>
                <p>
                  Bu Google etkinliği henüz bir müşteriyle eşleştirilmedi. Özel etkinlik
                  ayrıntıları gösterilmez.
                </p>
              </>
            ) : (
              <form
                key={selection.requestId}
                action="/api/calendar/appointments"
                method="post"
                className="desk-form"
              >
                <input type="hidden" name="requestId" value={selection.requestId} />
                <input type="hidden" name="therapistId" value={therapistId} />
                <input
                  type="hidden"
                  name="date"
                  value={toIstanbulInput(from).slice(0, 10)}
                />
                <label>
                  Seans biçimi
                  <select
                    name="sessionMode"
                    defaultValue={selection.event?.sessionMode ?? "IN_PERSON"}
                    disabled={!canEdit}
                  >
                    <option value="IN_PERSON">Klinikte</option>
                    <option value="ONLINE">Online · Google Meet</option>
                  </select>
                </label>
                {selection.event?.appointmentId ? (
                  <input
                    type="hidden"
                    name="appointmentId"
                    value={selection.event.appointmentId}
                  />
                ) : (
                  <label>
                    Müşteri
                    <select name="patientId" required defaultValue="">
                      <option value="" disabled>
                        Müşteri seçin
                      </option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {formatPatientName(c.displayName)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Başlangıç
                  <DateInput
                    type="datetime-local"
                    name="startAt"
                    defaultValue={selection.start}
                    required
                  />
                </label>
                <label>
                  Bitiş
                  <DateInput
                    type="datetime-local"
                    name="endAt"
                    defaultValue={selection.end}
                    required
                  />
                </label>
                {!connected && (
                  <p role="status">
                    Kaydetmek için terapistin Google Takvim bağlantısı gerekli. Müsaitlik
                    henüz doğrulanamadı.
                  </p>
                )}
                <button
                  className="admin-primary-btn"
                  disabled={
                    !canEdit ||
                    !connected ||
                    ["COMPLETED", "NO_SHOW_REVIEW"].includes(
                      selection.event?.status ?? "",
                    ) ||
                    (!selection.event && !customers.length)
                  }
                >
                  {selection.event ? "Değişikliği kaydet" : "Randevuyu oluştur"}
                </button>
              </form>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
