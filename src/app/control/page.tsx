import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { canManageKnowledge } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { FEATURE_FLAGS, FLAG_LABELS, type FeatureFlag } from "@/lib/settings/control";
import { loadClinicControls } from "@/lib/settings/service";
import { formatClinicDateTime } from "@/lib/clinic-clock";

export const dynamic = "force-dynamic";

const GROUPS: Array<{ title: string; hint: string; flags: FeatureFlag[] }> = [
  {
    title: "Ekranlar",
    hint: "Kapatılan ekran menüden kaldırılır. Yetkiler değişmez; bir ekranı açmak yetki vermez.",
    flags: FEATURE_FLAGS.filter((flag) => flag.startsWith("screen.")),
  },
  {
    title: "Asistan davranışı",
    hint: "Kapatılan davranışta asistan o konuyu üstlenmez ve konuşmayı ekibe aktarır.",
    flags: FEATURE_FLAGS.filter((flag) => flag.startsWith("assistant.")),
  },
  {
    title: "Operasyon bildirimleri",
    hint: "Gerçek WhatsApp teslimatı bağlanana kadar bu bildirimler yalnızca kayıt üretir.",
    flags: FEATURE_FLAGS.filter((flag) => flag.startsWith("ops.")),
  },
];

const MESSAGES: Record<string, string> = {
  assistant_on: "Asistan açıldı; gelen mesajlar yeniden otomatik yanıtlanıyor.",
  assistant_off:
    "Asistan kapatıldı. Yeni mesajlar yanıtlanmayacak, konuşmalar çalışana aktarılacak.",
  flag: "Ayar kaydedildi.",
};
const ERRORS: Record<string, string> = {
  flag: "Bilinmeyen ayar adı gönderildi; hiçbir değişiklik kaydedilmedi.",
  intent: "İstek anlaşılamadı; hiçbir değişiklik kaydedilmedi.",
};

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const user = await requireUser();
  if (!canManageKnowledge(user.role)) {
    return (
      <AdminShell user={user} active="settings">
        <div className="desk-page">
          <div className="errorbox">
            <h3>Bu ekrana erişemezsiniz</h3>
            <p>
              Kontrol ekranı yalnızca klinik yöneticisine açıktır. Kendi
              ayarlarınız için <Link href="/settings">Ayarlar</Link> sayfasını
              kullanabilirsiniz.
            </p>
          </div>
        </div>
      </AdminShell>
    );
  }
  const params = await searchParams;
  const controls = await loadClinicControls();
  const row = await prisma.clinicSettings.findUnique({ where: { id: "default" } });
  const lastChange = await prisma.auditEvent.findFirst({
    where: { action: { in: ["assistant.enabled", "assistant.disabled"] } },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { name: true } } },
  });

  return (
    <AdminShell user={user} active="settings">
      <div className="desk-page">
        <div className="admin-page-head">
          <div>
            <span className="admin-kicker">Yönetici kontrolü</span>
            <h1>Kontrol ekranı</h1>
            <p>
              Asistanı tamamen kapatın, ekranları menüden kaldırın veya tek tek
              davranışları kapatın. Her değişiklik kimin yaptığıyla birlikte
              kaydedilir ve dağıtım gerektirmez.
            </p>
          </div>
        </div>

        {params.done && MESSAGES[params.done] ? (
          <div className="onboarding-success" role="status">
            {MESSAGES[params.done]}
          </div>
        ) : null}
        {params.error && ERRORS[params.error] ? (
          <div className="onboarding-error" role="alert">
            {ERRORS[params.error]}
          </div>
        ) : null}

        <section className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <h2>Asistan</h2>
              <p>
                {controls.assistantEnabled
                  ? "Asistan açık: gelen mesajlar kurallar ve onaylı kaynaklarla yanıtlanıyor."
                  : "Asistan kapalı: gelen her mesaj çalışana aktarılıyor, otomatik yanıt gitmiyor."}
              </p>
            </div>
            <span
              className={
                controls.assistantEnabled
                  ? "settings-pill settings-pill--ok"
                  : "settings-pill"
              }
            >
              {controls.assistantEnabled ? "Açık" : "Kapalı"}
            </span>
          </div>
          <form action="/api/control" method="post" className="setup-form">
            <input
              type="hidden"
              name="intent"
              value="assistant"
              readOnly
            />
            <input
              type="hidden"
              name="enabled"
              value={controls.assistantEnabled ? "false" : "true"}
              readOnly
            />
            {controls.assistantEnabled ? (
              <label>
                Kapatma gerekçesi (kayda geçer)
                <input
                  name="reason"
                  type="text"
                  maxLength={300}
                  placeholder="Örnek: bakım penceresi"
                />
              </label>
            ) : null}
            <button className={controls.assistantEnabled ? "btn--danger" : "admin-primary-btn"} type="submit">
              {controls.assistantEnabled ? "Asistanı kapat" : "Asistanı aç"}
            </button>
          </form>
          <dl className="settings-meta">
            <div>
              <dt>Son değişiklik</dt>
              <dd>
                {lastChange
                  ? `${formatClinicDateTime(lastChange.createdAt)} · ${lastChange.actor?.name ?? "bilinmiyor"}`
                  : "Kayıt yok"}
              </dd>
            </div>
            <div>
              <dt>Kapatma gerekçesi</dt>
              <dd>{row?.assistantOffReason ?? "—"}</dd>
            </div>
          </dl>
        </section>

        {GROUPS.map((group) => (
          <section className="admin-panel" key={group.title}>
            <div className="admin-panel__head">
              <div>
                <h2>{group.title}</h2>
                <p>{group.hint}</p>
              </div>
            </div>
            <div className="control-flag-list">
              {group.flags.map((flag) => (
                <form
                  action="/api/control"
                  method="post"
                  className="control-flag"
                  key={flag}
                >
                  <input type="hidden" name="intent" value="flag" readOnly />
                  <input type="hidden" name="flag" value={flag} readOnly />
                  <input
                    type="hidden"
                    name="value"
                    value={controls.flags[flag] ? "false" : "true"}
                    readOnly
                  />
                  <span>
                    <b>{FLAG_LABELS[flag]}</b>
                    <small>{flag}</small>
                  </span>
                  <span
                    className={
                      controls.flags[flag]
                        ? "settings-pill settings-pill--ok"
                        : "settings-pill"
                    }
                  >
                    {controls.flags[flag] ? "Açık" : "Kapalı"}
                  </span>
                  <button className="admin-secondary-btn" type="submit">
                    {controls.flags[flag] ? "Kapat" : "Aç"}
                  </button>
                </form>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
