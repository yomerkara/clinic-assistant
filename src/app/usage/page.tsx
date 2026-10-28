import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsFrame } from "@/components/SettingsFrame";
import { AdminShell } from "@/components/AdminShell";
import { requireUser, toActor } from "@/lib/auth/session";
import { canViewUsage } from "@/lib/auth/rbac";
import { patientScope } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { getUsageBudgetStatus } from "@/lib/usage/record";
import { taskModelConfiguration } from "@/lib/llm/task-client";
import { formatPatientName } from "@/lib/patients/profile";
import {
  usageMoney as money,
  usageNumber as number,
  usageMonth,
} from "@/lib/usage/presentation";
import "./usage.css";
export const dynamic = "force-dynamic";
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; budget?: string }>;
}) {
  const user = await requireUser();
  if (!canViewUsage(user.role)) redirect("/queue");
  const params = await searchParams;
  const period = usageMonth(params.month);
  const admin = user.role === "ADMIN";
  const budget = await getUsageBudgetStatus();
  const freshPeriod = !params.month && Boolean(budget.resetAt);
  const periodLabel = freshPeriod ? "Yeni takip dönemi" : period.label;
  const where = {
    createdAt: { gte: freshPeriod ? budget.from : period.from, lt: period.to },
    ...(admin ? {} : { conversation: { patient: patientScope(toActor(user)) } }),
  };
  const [totals, models, groups, understand, answer, review] = await Promise.all([
    prisma.modelUsage.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true, billedCostUsd: true },
      _count: { _all: true, billedCostUsd: true },
    }),
    prisma.modelUsage.groupBy({
      by: ["model"],
      where,
      _sum: { inputTokens: true, outputTokens: true, billedCostUsd: true },
      _count: { _all: true, billedCostUsd: true },
    }),
    prisma.modelUsage.groupBy({
      by: ["conversationId"],
      where,
      _sum: { inputTokens: true, outputTokens: true, billedCostUsd: true },
      _count: { _all: true, billedCostUsd: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 100,
    }),
    taskModelConfiguration("understand"),
    taskModelConfiguration("answer"),
    taskModelConfiguration("review"),
  ]);
  const conversations = await prisma.conversation.findMany({
    where: {
      id: { in: groups.flatMap((g) => (g.conversationId ? [g.conversationId] : [])) },
      ...(admin ? {} : { patient: patientScope(toActor(user)) }),
    },
    select: { id: true, source: true, patient: { select: { displayName: true } } },
  });
  const missing = totals._count._all - totals._count.billedCostUsd;
  const tasks = [
    {
      label: "Mesajı anlama",
      config: understand,
      state:
        process.env.AI_UNDERSTAND_MODE === "active"
          ? "Demoda aktif"
          : process.env.AI_UNDERSTAND_MODE === "shadow"
            ? "Gözlem"
            : "Kapalı",
    },
    { label: "Açıklama üretme", config: answer, state: "Gerektiğinde" },
    {
      label: "Bağlam denetimi",
      config: review,
      state: process.env.CONTEXT_REVIEW === "shadow" ? "Gözlem" : "Kapalı",
    },
  ];
  return (
    <AdminShell user={user} active="settings">
      <SettingsFrame active="cost" role={user.role}>
        <div className="usage-page usage-ledger">
          <header className="usage-ledger-head">
            <div>
              <span className="admin-kicker">Santa AI</span>
              <h2>Kullanım ve maliyet</h2>
              <p>
                Haiku ile yeni dönemi takip et; her konuşmanın maliyetini ve model
                yanıtlarını incele.
              </p>
            </div>
            <form method="get" className="usage-period-form">
              <label htmlFor="usage-month">Rapor dönemi</label>
              <div>
                <input
                  id="usage-month"
                  type="month"
                  name="month"
                  defaultValue={period.value}
                  required
                />
                <button className="admin-primary-btn" type="submit">
                  Göster
                </button>
              </div>
            </form>
          </header>
          {budget.resetAt && (
            <p className="admin-alert" role="status">
              Takip sayacı{" "}
              {budget.resetAt.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}{" "}
              tarihinde sıfırlandı. Eski kayıtlar saklanıyor; ay seçerek önceki
              harcamaları görebilirsin.
              {!freshPeriod && (
                <>
                  {" "}
                  <Link href="/usage">Yeni takip dönemine dön →</Link>
                </>
              )}
            </p>
          )}
          {params.budget && (
            <p role="status" className="admin-alert">
              {params.budget === "saved"
                ? "Aylık kullanım limiti güncellendi."
                : "Limit kaydedilemedi. 1–10.000 USD arası bir tutar girin."}
            </p>
          )}
          <section className="usage-total-band" aria-label="Dönem özeti">
            <div>
              <span>{periodLabel} · toplam AI kullanımı</span>
              <strong>{money(Number(totals._sum.billedCostUsd ?? 0))}</strong>
              <small>
                Kaydedilen çağrıların işlem anındaki tarifeleriyle. Vergi ve abonelik
                bedeli dahil değildir.
              </small>
            </div>
            <dl>
              <div>
                <dt>Model çağrısı</dt>
                <dd>{number(totals._count._all)}</dd>
              </div>
              <div>
                <dt>Giriş tokenı</dt>
                <dd>{number(totals._sum.inputTokens ?? 0)}</dd>
              </div>
              <div>
                <dt>Çıkış tokenı</dt>
                <dd>{number(totals._sum.outputTokens ?? 0)}</dd>
              </div>
            </dl>
          </section>
          <p className="desk-muted">
            Tek bir paket akışı kullanılıyor; toplam tutar Haiku, Qwen ve diğer kayıtlı
            model çağrılarının toplamıdır. Koddan üretilen metin token harcamaz; aynı
            mesaj için anlama veya denetim çağrısı yapılmış olabilir. Kullanımı
            sağlayıcıdan alınamayan başarısız çağrılar bu toplama dahil değildir.
          </p>
          {missing > 0 && (
            <p className="admin-alert admin-alert--warning">
              {number(missing)} çağrının tarifesi kayıtlı değil. Bunlar ücretsiz
              sayılmadı; toplam tutar bu kayıtları içermiyor.
            </p>
          )}
          {admin && (
            <section className="usage-panel">
              <header>
                <div>
                  <span className="admin-kicker">Tek akış</span>
                  <h2>Aktif model yapısı</h2>
                </div>
              </header>
              <div className="usage-task-list">
                {tasks.map((t) => (
                  <div key={t.label}>
                    <div>
                      <b>{t.label}</b>
                      <small>{t.config.model}</small>
                    </div>
                    <span className="usage-state">{t.state}</span>
                    <div>
                      <span>{money(t.config.pricing.customerInput)} giriş</span>
                      <small>
                        {money(t.config.pricing.customerOutput)} çıkış / 1 milyon token
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              <p className="usage-panel-note">
                Bunlar ayrı abonelikler değil, aynı akışın görevleridir. Ücretsiz model
                tarifesi değişirse sonraki kayıtlar yeni tarife üzerinden hesaplanır.
              </p>
            </section>
          )}
          {admin && (
            <section className="usage-budget">
              <div className="usage-budget__copy">
                <span className="admin-kicker">
                  {budget.resetAt && budget.from.getTime() === budget.resetAt.getTime()
                    ? "Sıfırlamadan itibaren · bu ay"
                    : "İçinde bulunduğumuz ay"}
                </span>
                <h2>Aylık harcama limiti</h2>
                <p>
                  AI kullanımı limite ulaştığında yeni model çağrıları durdurulur. Kod
                  akışı ve mevcut güvenli alternatifler devam eder.
                </p>
                <div
                  className="usage-budget__progress"
                  role="progressbar"
                  aria-label="Aylık bütçe kullanımı"
                  aria-valuenow={Math.min(100, Math.round(budget.ratio * 100))}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${Math.min(100, budget.ratio * 100)}%` }} />
                </div>
                <small>
                  {money(budget.spentUsd)} kullanıldı · {money(budget.remainingUsd)} kaldı
                </small>
              </div>
              <form
                className="usage-budget__form"
                action="/api/usage/budget"
                method="post"
              >
                <label htmlFor="limitUsd">Aylık limit · USD</label>
                <div>
                  <span>$</span>
                  <input
                    id="limitUsd"
                    name="limitUsd"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    defaultValue={budget.limitUsd}
                    required
                  />
                </div>
                <button type="submit">Limiti kaydet</button>
              </form>
            </section>
          )}
          <section className="usage-panel">
            <header>
              <div>
                <span className="admin-kicker">Dağılım</span>
                <h2>Model bazında harcama</h2>
              </div>
            </header>
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Çağrı</th>
                    <th>Giriş</th>
                    <th>Çıkış</th>
                    <th>Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.model}>
                      <td>
                        <b>{m.model}</b>
                      </td>
                      <td>{number(m._count._all)}</td>
                      <td>{number(m._sum.inputTokens ?? 0)}</td>
                      <td>{number(m._sum.outputTokens ?? 0)}</td>
                      <td>
                        {m._count.billedCostUsd
                          ? money(Number(m._sum.billedCostUsd ?? 0))
                          : "Tarife yok"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!models.length && (
                <p className="usage-panel-note">
                  Bu dönemde kayıtlı model kullanımı yok.
                </p>
              )}
            </div>
          </section>
          <section className="usage-panel">
            <header>
              <div>
                <span className="admin-kicker">Konuşmalar</span>
                <h2>Harcamanın ayrıntısına in</h2>
              </div>
              <span>Son {groups.length} kayıt grubu</span>
            </header>
            <p className="usage-panel-note">
              Tutarlar seçilen döneme aittir. Ayrıntıda konuşmanın tamamını ve kayıtlı AI
              çağrılarını görebilirsin.
            </p>
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Müşteri / konuşma</th>
                    <th>Çağrı</th>
                    <th>Token</th>
                    <th>Tutar</th>
                    <th>
                      <span className="sr-only">Ayrıntı</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const c = conversations.find((c) => c.id === g.conversationId);
                    return (
                      <tr key={g.conversationId ?? "unlinked"}>
                        <td>
                          <b>
                            {c
                              ? formatPatientName(c.patient.displayName)
                              : "Konuşmaya bağlı olmayan çağrılar"}
                          </b>
                          <small className="usage-cell-meta">
                            {c?.source === "demo" ? "Demo · " : ""}
                            {g._max.createdAt?.toLocaleString("tr-TR", {
                              timeZone: "Europe/Istanbul",
                            })}
                          </small>
                        </td>
                        <td>{number(g._count._all)}</td>
                        <td>
                          {number((g._sum.inputTokens ?? 0) + (g._sum.outputTokens ?? 0))}
                        </td>
                        <td>
                          {g._count.billedCostUsd
                            ? money(Number(g._sum.billedCostUsd ?? 0))
                            : "Tarife yok"}
                        </td>
                        <td>
                          {c && (
                            <Link
                              className="usage-detail-link"
                              href={
                                admin
                                  ? `/usage/conversations/${c.id}`
                                  : `/conversations/${c.id}`
                              }
                            >
                              İncele →
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!groups.length && (
                <p className="usage-panel-note">
                  İlk model kullanımından sonra konuşmalar burada listelenecek.
                </p>
              )}
            </div>
          </section>
        </div>
      </SettingsFrame>
    </AdminShell>
  );
}
