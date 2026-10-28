import { prisma } from "@/lib/prisma";
import { requireUser, toActor } from "@/lib/auth/session";
import { patientScope } from "@/lib/auth/scope";
import { ThreadNavigation } from "./ThreadNavigation";
import { MessageText } from "./MessageText";
import { formatPatientName } from "@/lib/patients/profile";
import Link from "next/link";
import { formatDateTime, initials, maskPhone } from "@/lib/format";

type Props = {
  conversation: {
    id: string;
    mode: string;
    handoffReason: string | null;
    patient: { id: string; displayName: string; phone: string };
    assignedTo?: { name: string } | null;
    messages: Array<{
      id: string;
      direction: string;
      authorKind: string;
      text: string;
      createdAt: Date;
    }>;
  };
};

export async function ConversationThread({ conversation: c }: Props) {
  const user = await requireUser();
  const actor = toActor(user);
  const marker = await prisma.conversationRead.findUnique({
    where: { userId_conversationId: { userId: user.id, conversationId: c.id } },
  });
  const unread = c.messages.filter(
    (m) => m.direction === "INBOUND" && (!marker || m.createdAt > marker.readThroughAt),
  );
  const appointments = await prisma.appointment.findMany({
    where: {
      OR: [{patientId:c.patient.id},{actionRequests:{some:{conversationId:c.id}}}],
      patient: patientScope(actor),
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      endAt: { gte: new Date() },
      ...(actor.role === "THERAPIST"
        ? { therapistId: actor.therapistProfileId ?? "unassigned" }
        : {}),
    },
    include: { therapist: true, patient: true },
    orderBy: { startAt: "asc" },
    take: 10,
  });
  const human = c.mode === "HUMAN";
  return (
    <section className="desk-thread" aria-label="Müşteri konuşması">
      <header className="desk-thread-head">
        <Link href={`/patients/${c.patient.id}`} className="desk-person">
          <span className="conversation-avatar">
            {initials(formatPatientName(c.patient.displayName))}
          </span>
          <span>
            <b>{formatPatientName(c.patient.displayName)}</b>
            <small>{maskPhone(c.patient.phone)} · Müşteri bilgileri →</small>
          </span>
        </Link>
        <form action={`/api/conversations/${c.id}`} method="post">
          <input type="hidden" name="intent" value={human ? "reactivate" : "takeover"} />
          <button className="admin-secondary-btn" type="submit">
            {human ? "Asistanı etkinleştir" : "Konuşmayı devral"}
          </button>
        </form>
      </header>
      <div className="desk-thread-status" role="status">
        <span className={`desk-dot${human ? " is-human" : ""}`} />
        {human
          ? `Çalışan yönetiyor${c.assignedTo ? ` · ${c.assignedTo.name}` : ""}`
          : "Asistan aktif"}
        {c.handoffReason ? <span> · {c.handoffReason}</span> : null}
      </div>
      <div className="thread-context" aria-label="Mevcut randevular">
        <strong>Mevcut randevular</strong>
        {appointments.length ? (
          appointments.map((a) => (
            <div key={a.id} className="thread-appointment">
              <b>{formatPatientName(a.patient.displayName)} · {formatDateTime(a.startAt)}</b>
              <span>
                {a.therapist.displayName} ·{" "}
                {a.sessionMode === "ONLINE" ? "Online" : "Yüz yüze"} ·{" "}
                {a.status === "CONFIRMED" ? "Teyit edildi" : "Planlandı"}
              </span>
              <Link
                href={`/calendar?date=${a.startAt.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" })}&therapist=${a.therapistId}`}
              >
                Takvimde aç →
              </Link>
            </div>
          ))
        ) : (
          <p>Yaklaşan aktif randevu yok.</p>
        )}
      </div>
      <ThreadNavigation
        conversationId={c.id}
        lastMessageId={c.messages.at(-1)?.id}
        unreadId={unread[0]?.id}
        count={unread.length}
      />
      <ol className="desk-messages">
        {c.messages.map((m) => (
          <li
            key={m.id}
            id={`message-${m.id}`}
            className={`desk-message ${m.direction === "INBOUND" ? "is-inbound" : "is-outbound"}`}
          >
            {unread[0]?.id === m.id && (
              <div className="thread-unread">Okunmamış mesajlar</div>
            )}
            <span className="desk-message-author">
              {m.direction === "INBOUND"
                ? formatPatientName(c.patient.displayName)
                : m.authorKind === "BOT"
                  ? "Asistan"
                  : "Çalışan"}
            </span>
            <p>
              <MessageText text={m.text} />
            </p>
            <time dateTime={m.createdAt.toISOString()}>
              {formatDateTime(m.createdAt)}
            </time>
          </li>
        ))}
        {!c.messages.length ? (
          <li className="admin-empty">Bu konuşmada henüz mesaj yok.</li>
        ) : null}
      </ol>
      {!human && (
        <div className="desk-composer-handoff">
          <div>
            <b>Yanıtı siz yazın</b>
            <p>Asistan şu anda aktif. Yanıt vermek için konuşmayı devralın.</p>
          </div>
          <form action={`/api/conversations/${c.id}`} method="post">
            <input type="hidden" name="intent" value="takeover" />
            <button className="admin-primary-btn" type="submit">
              Devral ve yanıtla
            </button>
          </form>
        </div>
      )}
      {human && (
        <form
          className="desk-composer"
          action={`/api/conversations/${c.id}`}
          method="post"
        >
          <input type="hidden" name="intent" value="message" />
          <label className="sr-only" htmlFor="staff-message">
            Müşteriye mesaj
          </label>
          <textarea
            id="staff-message"
            name="text"
            rows={2}
            maxLength={5000}
            required
            disabled={!human}
            placeholder={
              human ? "Mesajınızı yazın…" : "Yanıt yazmak için konuşmayı devralın"
            }
          />
          <button className="admin-primary-btn" type="submit" disabled={!human}>
            Gönder
          </button>
        </form>
      )}
    </section>
  );
}
