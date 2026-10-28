import { ApplicationGuide } from "@/components/ApplicationGuide";
import { SettingsFrame } from "@/components/SettingsFrame";
import { initials, roleLabel } from "@/lib/format";

import { ControlIcon } from "@/components/ControlIcon";
import { canConnectCalendar, canManageKnowledge } from "@/lib/auth/rbac";
import { checkCalendarConnection } from "@/lib/calendar/google";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/AdminShell";
import { KnowledgePanel } from "./knowledge-panel";
import { DisconnectCalendarButton } from "./calendar-actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    calendar?: string;
    error?: string;
    section?: string;
    guide?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const section =
    user.role === "ADMIN" && ["knowledge", "team"].includes(params.section ?? "")
      ? params.section!
      : "calendar";
  const [connection, docs, calendarTeam, internalTeam] = await Promise.all([
    section === "calendar"
      ? prisma.calendarConnection.findUnique({ where: { userId: user.id } })
      : Promise.resolve(null),
    section === "knowledge" && canManageKnowledge(user.role)
      ? prisma.knowledgeDocument.findMany({ orderBy: { title: "asc" } })
      : Promise.resolve([]),
    section === "calendar" && user.role === "ADMIN"
      ? prisma.user.findMany({
          where: { role: { in: ["ADMIN", "THERAPIST"] }, active: true },
          include: { calendarConnection: { select: { id: true, calendarId: true } } },
          orderBy: { role: "asc" },
        })
      : Promise.resolve([]),
    section === "team" && user.role === "ADMIN"
      ? prisma.user.findMany({
          where: { active: true },
          select: { id: true, name: true, email: true, role: true, active: true },
          orderBy: [{ active: "desc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const calendarAllowed = canConnectCalendar(user.role);
  // A stored row is not proof of a working grant, so the viewer's own
  // connection is verified against Google before it is reported as connected.
  const calendarHealth =
    calendarAllowed && connection ? await checkCalendarConnection(user.id) : "absent";
  const calendarOk = calendarHealth === "connected";
  const calendarNeedsReconnect = calendarHealth === "reconnect_required";
  const calendarStatusLabel =
    calendarHealth === "connected"
      ? "Bağlı"
      : calendarHealth === "reconnect_required"
        ? "Yeniden bağlantı gerekli"
        : calendarHealth === "unverified"
          ? "Doğrulanamadı"
          : "Bekliyor";
  const errorText =
    params.error === "google_config"
      ? "Google Calendar henüz yapılandırılmadı. GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET ekleyin."
      : params.error === "google"
        ? "Google Calendar bağlantısı tamamlanamadı."
        : params.error === "calendar_not_allowed"
          ? "Stajyer hesabı için Google Calendar bağlantısı gerekli değildir."
          : null;

  return (
    <AdminShell user={user} active="settings">
      <SettingsFrame active={section} role={user.role}>
        <div className="settings-page">
          <header className="settings-category-heading">
            <h2>
              {section === "calendar"
                ? "Takvim bağlantıları"
                : section === "knowledge"
                  ? "Bilgi havuzu kaynakları"
                  : "Kurum içi ekip"}
            </h2>
            <p>
              {section === "calendar"
                ? "Google bağlantıları ve ekibin takvim erişimleri."
                : section === "knowledge"
                  ? "Asistanın yanıtlarında kullandığı kaynakları inceleyin ve güncelleyin."
                  : "Uygulamaya erişimi olan ekip üyeleri ve görevleri."}
            </p>
          </header>
          {section === "calendar" && (
            <>
              {errorText ? (
                <div className="admin-alert" role="alert">
                  <span>!</span>
                  <div>
                    <b>Bağlantı uyarısı</b>
                    <p>{errorText}</p>
                  </div>
                </div>
              ) : null}
              {params.calendar === "connected" ? (
                <div className="admin-alert" role="status">
                  <span>✓</span>
                  <div>
                    <b>Google Calendar bağlandı</b>
                    <p>Onaylanan randevular bu takvime yazılır, iptaller silinir.</p>
                  </div>
                </div>
              ) : null}

              {calendarAllowed ? (
                <section className="settings-section settings-section--calendar">
                  <header className="settings-section__head">
                    <div>
                      <span className="admin-kicker">Google Calendar</span>
                      <h2>
                        {calendarOk
                          ? "Takvim bağlı"
                          : calendarNeedsReconnect
                            ? "Takvim yetkisi geçersiz"
                            : calendarHealth === "unverified"
                              ? "Takvim doğrulanamadı"
                              : "Takvimi bağla"}
                      </h2>
                      {calendarNeedsReconnect ? (
                        <p>
                          Google bu hesabın yetkisini kabul etmiyor. Asistan bu takvimi
                          okuyamıyor; hastaya saat önerilmez ve talepler ekibe aktarılır.
                          Bağlantıyı yeniden kurun.
                        </p>
                      ) : calendarHealth === "unverified" ? (
                        <p>
                          Bağlantı kayıtlı ancak Google şu anda doğrulanamadı. Geçici bir
                          erişim sorunu olabilir; sorun sürerse bağlantıyı yenileyin.
                        </p>
                      ) : (
                        !calendarOk && (
                          <p>
                            Her terapist kendi Google hesabını bağlar. Onaylanan işlemler
                            ilgili terapistin takvimine yazılır.
                          </p>
                        )
                      )}
                    </div>
                    {calendarOk ? (
                      <DisconnectCalendarButton />
                    ) : (
                      <a className="admin-primary-btn" href="/api/calendar/google">
                        {calendarNeedsReconnect
                          ? "Takvimi yeniden bağla"
                          : "Google Calendar’ı bağla"}{" "}
                        <ControlIcon name="external" />
                      </a>
                    )}
                  </header>
                  <dl className="settings-meta">
                    <div>
                      <dt>Durum</dt>
                      <dd>
                        <span
                          className={
                            calendarOk
                              ? "settings-pill settings-pill--ok"
                              : "settings-pill"
                          }
                        >
                          {calendarStatusLabel}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Takvim</dt>
                      <dd>{connection?.calendarId ?? "primary"}</dd>
                    </div>
                    <div>
                      <dt>Bağlantı sahibi</dt>
                      <dd>{user.name}</dd>
                    </div>
                  </dl>
                </section>
              ) : (
                <section className="settings-section settings-section--calendar settings-section--restricted">
                  <header className="settings-section__head">
                    <div>
                      <span className="admin-kicker">Google Calendar</span>
                      <h2>Takvim bağlantısı gerekmiyor</h2>
                      <p>
                        Stajyer hesabı konuşmaları sürdürebilir; randevular yöneticinin
                        veya ilgili terapistin bağlı takvimine işlenir.
                      </p>
                    </div>
                  </header>
                </section>
              )}

              {user.role === "ADMIN" ? (
                <section className="settings-section">
                  <header className="settings-section__head">
                    <div>
                      <span className="admin-kicker">Takvim yetkileri</span>
                      <h2>Kişisel bağlantılar</h2>
                      <p>
                        Gizlilik nedeniyle her kişi kendi hesabıyla giriş yapıp Google
                        Calendar bağlantısını kendisi tamamlar.
                      </p>
                    </div>
                  </header>
                  <div className="settings-calendar-team">
                    {calendarTeam.map((member) => (
                      <div className="settings-calendar-person" key={member.id}>
                        <span>{member.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>
                        <div>
                          <b>{member.name}</b>
                          <small>
                            {member.role === "ADMIN" ? "Klinik yöneticisi" : "Terapist"}
                          </small>
                        </div>
                        <em className={member.calendarConnection ? "is-connected" : ""}>
                          {member.calendarConnection
                            ? "Takvim bağlı"
                            : "Bağlantı bekliyor"}
                        </em>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
          {section === "knowledge" && canManageKnowledge(user.role) ? (
            <KnowledgePanel
              docs={docs.map((doc) => ({
                id: doc.id,
                title: doc.title,
                source: doc.source,
                sourceUrl: doc.sourceUrl,
                version: doc.version,
                lastSyncedAt: doc.lastSyncedAt?.toISOString() ?? null,
                pendingContent: doc.pendingContent,
                approvalStatus: doc.approvalStatus,
              }))}
            />
          ) : null}

          {section === "team" && (
            <section className="settings-section" aria-label="Kurum içi ekip üyeleri">
              <div className="settings-internal-team">
                {internalTeam.map((member) => (
                  <div className="settings-internal-person" key={member.id}>
                    <span>{initials(member.name)}</span>
                    <div>
                      <b>{member.name}</b>
                      <small>
                        {member.email} · {roleLabel(member.role)}
                      </small>
                    </div>
                    <em>{member.active ? "Aktif" : "Pasif"}</em>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="settings-guide-footer" aria-label="Kurulum rehberi">
            <ApplicationGuide
              role={user.role}
              autoOpen={params.guide === "welcome"}
              showTrigger
            />
          </section>
        </div>
      </SettingsFrame>
    </AdminShell>
  );
}
