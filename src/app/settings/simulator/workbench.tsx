"use client";

import { formatClinicClock } from "@/lib/clinic-clock";
import { parseIstanbulInput, toIstanbulInput } from "@/lib/calendar/dates";
import { DateInput } from "@/components/DateInput";

import { useMemo, useState } from "react";
import { CONFIDENCE_THRESHOLD } from "@/lib/llm/types";
import type { SimulationConditions } from "@/lib/simulator/conditions";
import { PRESET_CHIPS, SCENARIO_OPTIONS } from "@/lib/simulator/conditions";
import type { SimulationDiagnosis } from "@/lib/simulator/rules";
import type { SimulationThreadView } from "@/lib/simulator/service";

type Props = { initial: SimulationThreadView };

export function SimulatorWorkbench({ initial }: Props) {
  const [conditions, setConditions] = useState(initial.conditions);
  const [turns, setTurns] = useState(initial.turns);
  const [selectedId, setSelectedId] = useState(initial.turns.at(-1)?.id ?? "");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const selected = useMemo(
    () => turns.find((turn) => turn.id === selectedId) ?? turns.at(-1) ?? null,
    [turns, selectedId],
  );

  async function post(body: unknown) {
    const response = await fetch("/api/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as SimulationThreadView & {
      error?: string;
      message?: string;
      detail?: string;
    };
    if (!response.ok) {
      throw Object.assign(new Error(payload.message ?? "İstek başarısız"), {
        detail: payload.detail,
      });
    }
    return payload;
  }

  async function send(text = draft) {
    const inbound = text.trim();
    if (!inbound || pending) {
      return;
    }
    setPending(true);
    setError(null);
    setDraft("");
    try {
      const next = await post({ intent: "turn", text: inbound });
      setTurns(next.turns);
      setSelectedId(next.turns.at(-1)?.id ?? "");
    } catch (err) {
      const failure = err as Error & { detail?: string };
      setError({ message: failure.message, detail: failure.detail });
      setDraft(inbound);
    } finally {
      setPending(false);
    }
  }

  async function updateConditions(patch: Partial<SimulationConditions>) {
    const next = { ...conditions, ...patch };
    setConditions(next);
    const saved = await post({ intent: "conditions", conditions: next });
    setConditions(saved.conditions);
  }

  async function reset() {
    const saved = await post({ intent: "reset" });
    setTurns(saved.turns);
    setSelectedId("");
    setResetOpen(false);
    setDetailOpen(false);
    setError(null);
  }

  return (
    <main>
      <div className="simbanner" role="status">
        <svg className="ic ic-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M9 3h6M10 3v5.2L5.5 17A2.6 2.6 0 0 0 7.8 21h8.4a2.6 2.6 0 0 0 2.3-4L14 8.2V3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7.2 15h9.6" strokeLinecap="round" />
        </svg>
        <div>
          <p className="ttl">TEST ORTAMI</p>
          <p>Buradan hiçbir mesaj gönderilmez, hiçbir randevu değişmez. Yazdıklarınız yalnızca asistanın ne yanıtlayacağını hesaplamak için kullanılır.</p>
          <p className="meta">Oluşan işlemler onay kuyruğuna düşmez ve hastalara bildirim gitmez.</p>
        </div>
      </div>

      <section>
        <div className="card">
          <details open>
            <summary>
              <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Test koşulları
            </summary>
            <p className="meta" style={{ margin: "2px 0 0" }}>
              Kuralların çalışıp çalışmadığını görebilmek için koşulları buradan değiştirin.
            </p>
            <div className="conds">
              <label className="field">
                <span>Senaryo</span>
                <select
                  value={conditions.scenario}
                  onChange={(event) =>
                    updateConditions({
                      scenario: event.target.value as SimulationConditions["scenario"],
                      calendar: event.target.value === "calendar_down" ? "unavailable" : conditions.calendar,
                      patientSetup: event.target.value === "two_people" ? "two_people" : conditions.patientSetup,
                    })
                  }
                >
                  {SCENARIO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Hasta kurgusu</span>
                <select
                  value={conditions.patientSetup}
                  onChange={(event) =>
                    updateConditions({ patientSetup: event.target.value as SimulationConditions["patientSetup"] })
                  }
                >
                  <option value="single">Tek kişi · tek randevu</option>
                  <option value="two_people">Aynı numaraya bağlı iki kişi</option>
                </select>
              </label>
              <label className="field">
                <span>Google Calendar</span>
                <select
                  value={conditions.calendar}
                  onChange={(event) =>
                    updateConditions({ calendar: event.target.value as SimulationConditions["calendar"] })
                  }
                >
                  <option value="available">Erişilebilir</option>
                  <option value="unavailable">Erişim yok</option>
                </select>
              </label>
              <label className="field">
                <span>“Şu an” değeri</span>
                <DateInput
                  type="datetime-local"
                  value={toLocalInput(conditions.nowAt)}
                  onChange={(event) =>
                    updateConditions({
                      // The clinic's own clock, not the browser's zone.
                      nowAt: Number.isFinite(
                        parseIstanbulInput(event.target.value).getTime(),
                      )
                        ? parseIstanbulInput(event.target.value).toISOString()
                        : conditions.nowAt,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Sağlayıcı</span>
                <select value="openai" disabled>
                  <option value="openai">Gerçek model</option>
                </select>
              </label>
              <label className="field">
                <span>Model / istem sürümü</span>
                <select value={conditions.modelVersion} disabled>
                  <option value={conditions.modelVersion}>
                    {conditions.modelVersion} · istem 2026-08-25
                  </option>
                </select>
              </label>
            </div>
            <p className="meta" style={{ margin: "12px 0 0" }}>
              Yanıt her zaman gerçek modelden gelir. Sahte adaptör yalnızca otomatik testlerde kullanılır.
            </p>
          </details>
        </div>
      </section>

      <section>
        <div className="simframe">
          <div className="simgrid">
            <div className="phonewrap">
              <h2 style={{ letterSpacing: ".04em", margin: "0 0 8px" }}>HASTA GÖRÜNÜMÜ</h2>
              <div className="phone">
                <div className="phone__bar">
                  <span className="initials" aria-hidden="true">
                    SP
                  </span>
                  <span className="who">
                    <b>Santa Psikoloji</b>
                    <span className="meta">Test Hasta (örnek kayıt) · +90 5•• ••• 00 00</span>
                  </span>
                  <span className="badge badge--sim">SİMÜLASYON</span>
                </div>
                <div className="phone__thread">
                  <p className="daysep">Simüle edilen gün</p>
                  {turns.length === 0 ? (
                    <p className="meta" style={{ margin: 0 }}>
                      Henüz mesaj yok. Hasta olarak yazın.
                    </p>
                  ) : (
                    <ul className="thread">
                      {turns.map((turn, index) => (
                        <TurnPair
                          key={turn.id}
                          turn={turn}
                          index={index}
                          total={turns.length}
                          selected={turn.id === selected?.id}
                          onSelect={() => setSelectedId(turn.id)}
                        />
                      ))}
                    </ul>
                  )}
                  {selected?.botStopped ? (
                    <p className="sysline">Simülasyonda asistan yanıt vermeyi bıraktı</p>
                  ) : null}
                </div>
                <div className="phone__composer">
                  <div className="chiprow" role="group" aria-label="Hazır senaryo mesajları">
                    {PRESET_CHIPS.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        className="chip"
                        disabled={pending}
                        onClick={() => send(chip.text)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                  <div className="composer__row">
                    <label className="sr-only" htmlFor="sim-mesaj">
                      Hasta mesajı
                    </label>
                    <textarea
                      id="sim-mesaj"
                      rows={1}
                      placeholder="Hasta olarak yazın…"
                      value={draft}
                      disabled={pending}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="send"
                      aria-label={pending ? "Hesaplanıyor" : "Asistanın yanıtını hesapla"}
                      disabled={pending || !draft.trim()}
                      onClick={() => void send()}
                    >
                      <svg className="ic ic-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                        <path d="M4.5 12 20 5l-4.2 14.5-4-5.6z" strokeLinejoin="round" />
                        <path d="M11.8 13.9 20 5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <p className="help">Mesaj gönderilmez; yalnızca asistanın yanıtı hesaplanır.</p>
                </div>
              </div>
              <div className="phonefoot">
                <p className="meta" style={{ margin: 0 }}>
                  Bir yanıt kutusuna dokunarak o turun çözümlemesini görebilirsiniz.
                </p>
                <button type="button" className="btn btn--ghost" onClick={() => setResetOpen(true)}>
                  Konuşmayı sıfırla
                </button>
              </div>
            </div>

            <div className="diagwrap">
              {error ? (
                <div className="errorbox">
                  <h3>Çözümleme yapılamadı</h3>
                  <p>Model çağrısı yanıt vermedi. Bu tur kaydedilmedi; tekrar deneyebilirsiniz.</p>
                  {error.detail ? <p className="meta">{error.detail}</p> : null}
                  <button type="button" className="btn btn--ghost" onClick={() => void send()}>
                    Tekrar dene
                  </button>
                </div>
              ) : pending ? (
                <div className="card">
                  <div className="diag__head">
                    <h2>ÇÖZÜMLEME</h2>
                    <span className="badge badge--neutral">Hesaplanıyor…</span>
                  </div>
                  <p className="meta" role="status">
                    Asistanın yanıtı hesaplanıyor. Yazma alanı bu sırada kapalıdır.
                  </p>
                  <div className="skel skel--lbl" />
                  <div className="skel skel--num" />
                  <div className="skel skel--bar" />
                  <div className="skel skel--line" />
                  <div className="skel skel--line2" />
                </div>
              ) : !selected ? (
                <div className="panel">
                  <h3>Henüz bir tur yok</h3>
                  <p>Hasta olarak bir mesaj yazın ya da hazır senaryolardan birini seçin; asistanın ne yanıtlayacağını ve neden öyle yanıtladığını burada göreceksiniz.</p>
                </div>
              ) : (
                <DiagnosisCard
                  turn={selected}
                  index={turns.findIndex((item) => item.id === selected.id)}
                  total={turns.length}
                  onOpenDetail={() => setDetailOpen(true)}
                />
              )}
            </div>
          </div>

          {detailOpen && selected?.action ? (
            <SimulatedDetail turn={selected} onClose={() => setDetailOpen(false)} />
          ) : null}
        </div>
      </section>

      {resetOpen ? (
        <div className="sheetwrap is-open">
          <button type="button" className="sheetbg" aria-label="Kapat" onClick={() => setResetOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sifirla-baslik">
            <h3 id="sifirla-baslik">Test konuşması sıfırlanacak</h3>
            <p>Bu simülasyondaki tüm turlar ve çözümlemeler silinir.</p>
            <ul>
              <li>Test koşulları olduğu gibi kalır.</li>
              <li>Gerçek hiçbir kayıt etkilenmez.</li>
            </ul>
            <div className="btnrow">
              <button type="button" className="btn btn--primary btn--block" onClick={() => void reset()}>
                Evet, sıfırla
              </button>
              <button type="button" className="btn btn--ghost btn--block" onClick={() => setResetOpen(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function TurnPair({
  turn,
  index,
  total,
  selected,
  onSelect,
}: {
  turn: SimulationDiagnosis;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const time = formatClock(turn.createdAt);
  return (
    <>
      <li className="msg msg--in">
        <p className="author">Test Hasta · hasta</p>
        <p className="bubble">{turn.inbound}</p>
        <p className="time">{time}</p>
      </li>
      <li className="msg msg--out msg--bot">
        <p className="author">Asistan · otomatik bot</p>
        <button type="button" className={selected ? "turnsel is-on" : "turnsel"} onClick={onSelect}>
          <span className="bubble">{turn.outbound}</span>
          {selected ? (
            <span className="selmark">seçili tur · {index === total - 1 ? "son tur" : `${index + 1}. tur`}</span>
          ) : null}
        </button>
        <p className="time">{time}</p>
      </li>
    </>
  );
}

function DiagnosisCard({
  turn,
  index,
  total,
  onOpenDetail,
}: {
  turn: SimulationDiagnosis;
  index: number;
  total: number;
  onOpenDetail: () => void;
}) {
  const pct = Math.round(turn.confidence * 100);
  const low = turn.confidence < CONFIDENCE_THRESHOLD;
  return (
    <div className="diag card">
      <div className="diag__head">
        <h2>ÇÖZÜMLEME · {index === total - 1 ? "SON TUR" : `${index + 1}. TUR`}</h2>
        <span className="badge badge--neutral">{formatClock(turn.createdAt)}</span>
      </div>
      {turn.provider === "fake" ? (
        <div className="strip" style={{ marginBottom: 12 }}>
          <div>
            <p className="lbl">Sahte adaptör (fake)</p>
            <p>Yanıt gerçek modelden değil, sabit kurgudan geldi.</p>
          </div>
        </div>
      ) : null}
      <div className="block">
        <h3>Niyet</h3>
        <div className="kv">
          <span className="name">{turn.intentLabel}</span>
          <span className="badge badge--neutral">{turn.intent.toLowerCase()}</span>
        </div>
      </div>
      <div className="block">
        <h3>Model skoru</h3><small>Kalibre edilmiş doğruluk olasılığı değildir.</small>
        <p className="conf__num" style={{ margin: 0 }}>
          %{pct}
        </p>
        <div className="conf__bar" role="img" aria-label={`Model skoru ${pct}/100`}>
          <span className={low ? "conf__fill conf__fill--low" : "conf__fill"} style={{ width: `${pct}%` }} />
          <span className="conf__thr" style={{ left: `${CONFIDENCE_THRESHOLD * 100}%` }} />
        </div>
        <p className="conf__legend">
          <span>%0</span>
          <span>eşik %{Math.round(CONFIDENCE_THRESHOLD * 100)} (geçici)</span>
          <span>%100</span>
        </p>
      </div>
      <div className="block">
        <h3>Varlıklar</h3>
        <dl className="audit">
          <div>
            <dt>Konu / tarih</dt>
            <dd>{turn.entities.topic ?? turn.entities.date ?? "—"}</dd>
          </div>
          <div>
            <dt>Saat</dt>
            <dd className={turn.entities.time ? undefined : "pending"}>{turn.entities.time ?? "—"}</dd>
          </div>
          <div>
            <dt>Terapist</dt>
            <dd className={turn.entities.therapistName ? undefined : "pending"}>
              {turn.entities.therapistName ?? "—"}
            </dd>
          </div>
        </dl>
        <details>
          <summary>
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Ham çıktıyı göster
          </summary>
          <p className="excerpt">{JSON.stringify(turn.raw, null, 2)}</p>
        </details>
      </div>
      <div className="block">
        <h3>Kaynak</h3>
        {turn.knowledge ? (
          <>
            <div className="kv">
              <span className="name">{turn.knowledge.title}</span>
              <span className="badge badge--ok">Onaylı</span>
            </div>
            <p className="meta">
              {turn.knowledge.id} · sürüm {turn.knowledge.version} · {turn.knowledge.source}
            </p>
          </>
        ) : (
          <p style={{ margin: 0 }}>Bilgi havuzu kullanılmadı.</p>
        )}
      </div>
      <div className="block">
        <h3>Oluşan işlem</h3>
        {turn.action ? (
          <>
            <div className="kv" style={{ marginBottom: 10 }}>
              <span className="dt">{turn.action.id}</span>
              <span className={turn.action.status === "AUTO_APPLIED" ? "badge badge--ok" : "badge badge--wait"}>
                {turn.action.status === "AUTO_APPLIED" ? "Otomatik uygulandı" : "Onay bekliyor"}
              </span>
            </div>
            <div className="strip">
              <div>
                <p className="lbl">Kuyruğa eklenmedi</p>
                <p>
                  {turn.action.currentLabel} → {turn.action.proposedLabel}. Bu işlem yalnızca simülasyonda oluşturuldu.
                </p>
              </div>
            </div>
            <button type="button" className="linkbtn" onClick={onOpenDetail}>
              Simüle işlemi gör
            </button>
          </>
        ) : (
          <p style={{ margin: 0 }}>İşlem oluşmadı.</p>
        )}
      </div>
      <div className="block">
        <h3>Devir</h3>
        {turn.handoff ? (
          <div className="strip">
            <div>
              <p className="lbl">Devir nedeni</p>
              <p>{turn.handoff.reason}</p>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0 }}>Devir tetiklenmedi.</p>
        )}
      </div>
      <div className="block">
        <h3>Uygulanan kurallar</h3>
        <ul className="rules">
          {turn.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>
      <div className="diagfoot">
        <span>
          Gecikme <b>{turn.latencyMs == null ? "—" : `${(turn.latencyMs / 1000).toLocaleString("tr-TR")} s`}</b>
        </span>
        <span>
          Model <b>{turn.model ?? "—"}</b>
        </span>
        <span>
          İstem <b>{turn.promptVersion ?? "—"}</b>
        </span>
        <span>
          Sağlayıcı <b>{turn.provider === "openai" ? "Gerçek model" : "Sahte adaptör"}</b>
        </span>
      </div>
      <p style={{ margin: "12px 0 0" }}>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void navigator.clipboard.writeText(JSON.stringify(turn, null, 2))}
        >
          Turu kopyala
        </button>
      </p>
    </div>
  );
}

function SimulatedDetail({ turn, onClose }: { turn: SimulationDiagnosis; onClose: () => void }) {
  const action = turn.action!;
  return (
    <div className="simdetail is-open">
      <div className="card">
        <div className="simdetail__head">
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Simüle işlem detayı</h3>
          <span className="badge badge--sim">SİMÜLASYON</span>
          <button type="button" className="linkbtn" onClick={onClose} style={{ marginLeft: "auto" }}>
            Kapat
          </button>
        </div>
        <p className="meta">Bu, işlem gerçek olsaydı stajyerin göreceği ekranın salt okunur kopyasıdır.</p>
        <dl className="audit">
          <div>
            <dt>İşlem no</dt>
            <dd>{action.id} (simülasyon)</dd>
          </div>
          <div>
            <dt>Önerilen</dt>
            <dd>{action.proposedLabel}</dd>
          </div>
        </dl>
        <button type="button" className="btn btn--primary btn--block" disabled>
          Onayla
        </button>
        <p className="disabledwhy" style={{ justifyContent: "center" }}>
          Test ortamında onaylanamaz — bu işlem gerçek bir randevuya bağlı değil.
        </p>
      </div>
    </div>
  );
}

function toLocalInput(iso: string) {
  return toIstanbulInput(iso);
}

function formatClock(iso: string) {
  return formatClinicClock(iso);
}
