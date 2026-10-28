"use client";

export default function QueueError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app">
      <header className="topbar">
        <h1>Bekleyen İşlemler</h1>
      </header>
      <main>
        <div className="errorbox">
          <h3>İşlemler yüklenemedi</h3>
          <p>Bağlantınızı kontrol edip tekrar deneyin.</p>
          <button type="button" className="btn btn--ghost" onClick={() => reset()}>
            Tekrar dene
          </button>
        </div>
      </main>
    </div>
  );
}
