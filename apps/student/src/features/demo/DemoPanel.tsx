// The hidden demo panel (CLAUDE.md 9): triple-tap the day chip on the main screen. Staff-only,
// so its labels are English-only and live in actions.ts, not in the students' string files.
import { useEffect, useRef, useState } from 'react';
import { ACTIONS } from './actions';
import type { DemoContext } from './actions';
import '../../design/kenney.css';
import '../life/life.css';
import './demo.css';

export function DemoPanel({ ctx, onClose }: { ctx: DemoContext; onClose: () => void }) {
  const [, redraw] = useState(0); // toggle labels (offline) change after a tap
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  return (
    <div className="lf-overlay" lang="en" onClick={onClose}>
      <div className="lf-sheet k-panel dm-sheet" role="dialog" aria-modal="true" aria-labelledby="dm-title" onClick={(e) => e.stopPropagation()}>
        <div className="lf-sheet-head">
          <h2 id="dm-title" className="k-banner lf-title">Demo panel</h2>
          <button ref={closeRef} className="k-round" onClick={onClose} aria-label="Close demo panel">
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM4 4h1v1H4zM1 5h1v1H1zM5 5h1v1H5zM0 6h1v1H0zM6 6h1v1H6z" />
            </svg>
          </button>
        </div>
        {groups.map((g) => (
          <section key={g} className="dm-group" aria-label={g}>
            <h3 className="dm-head">{g}</h3>
            <div className="dm-grid">
              {ACTIONS.filter((a) => a.group === g).map((a, i) => {
                const label = typeof a.label === 'function' ? a.label() : a.label;
                return (
                  <button
                    key={`${g}-${i}`}
                    className="k-btn dm-btn"
                    onClick={() => {
                      void Promise.resolve(a.run(ctx)).finally(() => redraw((n) => n + 1));
                      if (!a.stay) onClose();
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
