export function PageLoading({ title }: { title: string }) {
  return (
    <div
      className="page-loading-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <span className="page-loading-spinner" aria-hidden="true" />
      <span className="page-loading-label">{title}</span>
    </div>
  );
}
