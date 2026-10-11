/** The round pixel-arrow back button the store's games use. */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="k-round" onClick={onClick} aria-label={label}>
      <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
        <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
      </svg>
    </button>
  );
}
