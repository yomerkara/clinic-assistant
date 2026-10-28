"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
type Row = {
  id: string;
  name: string;
  title: string;
  preview: string;
  status: string;
  owner: string;
  date: string;
  overdue: boolean;
  detail: ReactNode;
};
export function RequestsInbox({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState(rows[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => {
      const id = location.hash.replace(/^#request-/, "");
      if (rows.some((r) => r.id === id)) {
        setSelected(id);
        setMobileDetail(true);
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [rows]);
  const matches = rows.filter((r) =>
    `${r.name} ${r.title} ${r.preview} ${r.owner}`
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR")),
  );
  const active = matches.find((r) => r.id === selected) ?? matches[0];
  const choose = (row: Row) => {
    setSelected(row.id);
    setMobileDetail(true);
    history.replaceState(null, "", `#request-${row.id}`);
    panel.current?.scrollTo(0, 0);
  };
  return (
    <section
      className={`requests-inbox${mobileDetail ? " showing-detail" : ""}`}
      aria-label="Talep çalışma alanı"
    >
      <div className="inbox-list">
        <div className="inbox-list-head">
          <label htmlFor="request-search">Taleplerde ara</label>
          <input
            id="request-search"
            type="search"
            placeholder="Müşteri, konu veya sorumlu…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setMobileDetail(false);
            }}
          />
          <span aria-live="polite">{matches.length} talep</span>
        </div>
        <div className="inbox-rows">
          {matches.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`inbox-row${active?.id === row.id ? " is-active" : ""}`}
              aria-pressed={active?.id === row.id}
              onClick={() => choose(row)}
            >
              <span className="inbox-row-top">
                <strong>{row.name}</strong>
                <time>{row.date}</time>
              </span>
              <span className="inbox-row-title">{row.title}</span>
              <span className="inbox-preview">{row.preview}</span>
              <span className="inbox-row-bottom">
                <span className={`inbox-status${row.overdue ? " is-overdue" : ""}`}>
                  {row.overdue ? "Takip gecikti" : row.status}
                </span>
                <span className="inbox-owner">{row.owner}</span>
              </span>
            </button>
          ))}
          {!matches.length && (
            <div className="inbox-no-results">
              <strong>Talep bulunamadı</strong>
              <p>Aramanızı veya üstteki filtreyi değiştirebilirsiniz.</p>
              {search && (
                <button type="button" onClick={() => setSearch("")}>
                  Aramayı temizle
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="inbox-detail" ref={panel}>
        <div className="inbox-detail-bar">
          <button
            type="button"
            onClick={() => setMobileDetail(false)}
            className="inbox-back"
          >
            ← Listeye dön
          </button>
          <span>TALEP DETAYI</span>
          <small>{active ? "Atayın, takip edin, sonuçlandırın" : ""}</small>
        </div>
        {active ? (
          <div key={active.id}>{active.detail}</div>
        ) : (
          <div className="inbox-empty">
            <h2>Her şey burada takip altında</h2>
            <p>
              Görüntülenecek talep yok. Bir talep seçtiğinizde ayrıntıları burada açılır.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
