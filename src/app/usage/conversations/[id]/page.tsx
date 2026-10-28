import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/AdminShell";
import { formatPatientName } from "@/lib/patients/profile";
import {
  usageMoney as money,
  usageNumber as number,
  taskLabels,
} from "@/lib/usage/presentation";
import "../../usage.css";
export const dynamic = "force-dynamic";
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function Output({ value }: { value: unknown }) {
  return <pre className="usage-trace-output">{text(value) ?? "Çıktı kaydı yok."}</pre>;
}
function time(date: Date) {
  return date.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "short",
    timeStyle: "short",
  });
}
export default async function UsageConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/queue");
  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      patient: true,
      messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!conversation) notFound();
  const usage = await prisma.modelUsage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
  });
  const events = await prisma.auditEvent.findMany({
    where: {
      OR: [
        {
          entityType: "Message",
          entityId: { in: conversation.messages.map((m) => m.id) },
          action: {
            in: [
              "assistant.understanding",
              "assistant.understanding_applied",
              "assistant.decision",
              "assistant.context_review",
              "assistant.calendar_check",
            ],
          },
        },
        {
          action: "assistant.model_call",
          entityType: "ModelUsage",
          entityId: { in: usage.map((u) => u.id) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  const callEvents = events.filter((e) => e.action === "assistant.model_call");
  const unlinked = usage.filter((u) => !callEvents.some((e) => e.entityId === u.id));
  const totals = usage.reduce(
    (s, u) => ({
      cost: s.cost + Number(u.billedCostUsd ?? 0),
      input: s.input + u.inputTokens,
      output: s.output + u.outputTokens,
    }),
    { cost: 0, input: 0, output: 0 },
  );
  return (
    <AdminShell user={user} active="usage">
      <div className="usage-trace-page">
        <Link className="desk-back" href="/usage">
          ← Kullanım ve maliyete dön
        </Link>
        <header className="usage-ledger-head">
          <div>
            <span className="admin-kicker">
              {conversation.source === "demo" ? "Demo konuşması" : "Hasta konuşması"} · AI
              işlem ayrıntıları
            </span>
            <h1>{formatPatientName(conversation.patient.displayName)}</h1>
            <p>
              Sonnet’in yorumu, kodun kararı, model taslakları ve müşteriye gönderilen
              yanıt.
            </p>
          </div>
          <Link className="admin-secondary-btn" href={`/conversations/${id}`}>
            Konuşmayı yönet →
          </Link>
        </header>
        <section className="usage-total-band">
          <div>
            <span>Bu konuşmanın toplam AI kullanımı · tüm zamanlar</span>
            <strong>{money(totals.cost)}</strong>
            <small>İşlem anında kaydedilen tarife; abonelik ve vergi dahil değil.</small>
          </div>
          <dl>
            <div>
              <dt>Model çağrısı</dt>
              <dd>{number(usage.length)}</dd>
            </div>
            <div>
              <dt>Giriş tokenı</dt>
              <dd>{number(totals.input)}</dd>
            </div>
            <div>
              <dt>Çıkış tokenı</dt>
              <dd>{number(totals.output)}</dd>
            </div>
          </dl>
        </section>
        {usage.some((u) => u.billedCostUsd == null) && (
          <p className="admin-alert admin-alert--warning">
            Tarifesi bulunmayan çağrılar toplam tutara dahil değil.
          </p>
        )}
        <p className="desk-muted">
          “Yanıt taslağı” müşteriye gönderilmiş olmak zorunda değildir. Gönderilen metin
          yeşil alanda gösterilir. Denetim çıktısı gözlem amaçlıdır. Burada modellerin
          kayıtlı yanıtları yer alır; gizli düşünce zinciri gösterilmez.
        </p>
        <div className="usage-trace-timeline">
          {conversation.messages.map((message, index) => {
            const audits = events.filter(
              (e) => e.entityId === message.id && e.action !== "assistant.model_call",
            );
            const calls = callEvents.filter(
              (e) => object(e.metadata).messageId === message.id,
            );
            const outbound = message.direction === "OUTBOUND";
            return (
              <article
                key={message.id}
                className={`usage-turn ${outbound ? "usage-turn--outbound" : ""}`}
              >
                <header>
                  <b>
                    {outbound
                      ? message.authorKind === "BOT"
                        ? "Gönderilen yanıt"
                        : "Çalışan mesajı"
                      : `${index + 1}. Müşteri mesajı`}
                  </b>
                  <time dateTime={message.createdAt.toISOString()}>
                    {time(message.createdAt)}
                  </time>
                </header>
                <p className="usage-turn-text">{message.text}</p>
                {calls.map((event) => {
                  const meta = object(event.metadata);
                  const call = usage.find((u) => u.id === event.entityId)!;
                  return (
                    <details className="usage-trace-step" key={event.id}>
                      <summary>
                        <span>
                          <b>{taskLabels[String(meta.task)] ?? "Model çağrısı"}</b>
                          <small>{call.model}</small>
                        </span>
                        <span>
                          {number(call.inputTokens)} giriş · {number(call.outputTokens)}{" "}
                          çıkış{" "}
                          <strong>
                            {call.billedCostUsd != null
                              ? money(Number(call.billedCostUsd))
                              : "Tarife yok"}
                          </strong>
                        </span>
                      </summary>
                      <p className="usage-panel-note">
                        {typeof meta.latencyMs === "number"
                          ? `${(meta.latencyMs / 1000).toFixed(1)} sn · `
                          : ""}
                        {meta.task === "review"
                          ? "Gözlem çıktısı; müşteriye gönderilmedi."
                          : meta.task === "answer"
                            ? "Model taslağı; aşağıdaki gönderilen yanıtla karşılaştırın."
                            : "Kaydedilen yapılandırılmış çıktı."}
                      </p>
                      <Output value={meta.output} />
                    </details>
                  );
                })}
                {audits.map((event) => {
                  const meta = object(event.metadata);
                  const task =
                    event.action === "assistant.understanding"
                      ? "understand"
                      : event.action === "assistant.context_review"
                        ? "review"
                        : null;
                  if (task && calls.some((c) => object(c.metadata).task === task))
                    return null;
                  const label =
                    event.action === "assistant.decision"
                      ? "Kodun son kararı"
                      : event.action === "assistant.understanding_applied"
                        ? "Sonnet yorumunun akışa etkisi"
                        : event.action === "assistant.calendar_check"
                          ? "Takvim kontrolü"
                          : task === "understand"
                            ? "Sonnet / anlama kaydı"
                            : "Bağlam denetimi";
                  const tokens = object(meta.usage);
                  return (
                    <details className="usage-trace-step" key={event.id}>
                      <summary>
                        <span>
                          <b>{label}</b>
                          <small>
                            {typeof meta.model === "string"
                              ? meta.model
                              : "Uygulama kodu"}
                          </small>
                        </span>
                        <span>
                          {meta.status === "code_only"
                            ? "Model çağrılmadı"
                            : typeof tokens.totalTokens === "number"
                              ? `${number(Number(tokens.inputTokens ?? 0))} giriş · ${number(Number(tokens.outputTokens ?? 0))} çıkış`
                              : event.action === "assistant.understanding_applied"
                                ? meta.changedPlan
                                  ? "Plan değişti"
                                  : "Kodla aynı yorum"
                                : "Ayrıntıyı aç"}
                        </span>
                      </summary>
                      <Output
                        value={
                          task === "understand"
                            ? (meta.interpretation ?? meta)
                            : task === "review"
                              ? (meta.verdict ?? meta)
                              : meta
                        }
                      />
                    </details>
                  );
                })}
              </article>
            );
          })}
        </div>
        {unlinked.length > 0 && (
          <section className="usage-panel">
            <header>
              <div>
                <span className="admin-kicker">Önceki kayıtlar</span>
                <h2>Mesaja bağlı ayrıntısı bulunmayan çağrılar</h2>
              </div>
            </header>
            <p className="usage-panel-note">
              Bu çağrıların maliyet ve tokenları toplamda yer alıyor. Eski kayıtlarda
              mesaj bağlantısı veya ham yanıt saklanmadığı için sonradan tahmin edilmedi.
              Varsa eski Sonnet ve denetim çıktıları yukarıdaki mesajlarda ayrıca
              gösterilir.
            </p>
            <div className="usage-table-wrap">
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Zaman</th>
                    <th>Model</th>
                    <th>Giriş</th>
                    <th>Çıkış</th>
                    <th>Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {unlinked.map((u) => (
                    <tr key={u.id}>
                      <td>{time(u.createdAt)}</td>
                      <td>{u.model}</td>
                      <td>{number(u.inputTokens)}</td>
                      <td>{number(u.outputTokens)}</td>
                      <td>
                        {u.billedCostUsd != null
                          ? money(Number(u.billedCostUsd))
                          : "Tarife yok"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
