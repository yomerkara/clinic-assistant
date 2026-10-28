import Link from "next/link";

export function TabBar({
  current,
  pendingCount,
}: {
  current: "queue" | "settings";
  pendingCount: number;
}) {
  return (
    <nav className="tabbar" aria-label="Ana gezinme">
      <ul>
        <li>
          <Link className="tab" href="/queue" aria-current={current === "queue" ? "page" : undefined}>
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 7h11M4 12h11M4 17h7" strokeLinecap="round" />
              <path d="M17.5 15.5l2 2 3-3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            İşlemler
            {pendingCount > 0 ? <span className="num">{pendingCount}</span> : null}
          </Link>
        </li>
        <li>
          <span className="tab" aria-disabled="true">
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7v5l3 2" strokeLinecap="round" />
            </svg>
            Yanıtsızlar
          </span>
        </li>
        <li>
          <span className="tab" aria-disabled="true">
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M20 12.5c0 3.6-3.6 6.5-8 6.5-.9 0-1.8-.1-2.6-.4L5 20l1-3.2A6.4 6.4 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5z" strokeLinejoin="round" />
            </svg>
            Konuşmalar
          </span>
        </li>
        <li>
          <Link className="tab" href="/settings" aria-current={current === "settings" ? "page" : undefined}>
            <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" strokeLinecap="round" />
            </svg>
            Ayarlar
          </Link>
        </li>
      </ul>
    </nav>
  );
}
