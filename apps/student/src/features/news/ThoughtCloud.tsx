import { useRef } from 'react';
import {
  arrow,
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { getTerm, t } from './content';
import { speak, useVoice } from './speech';
import type { Lang } from './types';

/**
 * A glossary word's meaning in a thought-cloud bubble anchored to the tapped word. Floating UI
 * keeps it on a 360 px screen (flip + shift, 8 px padding); outside tap and Escape close it.
 */
export function ThoughtCloud({ lang, termId, anchor, onClose }: {
  lang: Lang;
  termId: string;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const term = getTerm(termId);
  const tailRef = useRef<HTMLSpanElement>(null);
  const { refs, floatingStyles, context, placement, middlewareData } = useFloating({
    open: true,
    onOpenChange: (open) => !open && onClose(),
    elements: { reference: anchor },
    placement: 'top',
    middleware: [offset(18), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: tailRef, padding: 24 })],
    whileElementsMounted: autoUpdate,
  });
  const { getFloatingProps } = useInteractions([useDismiss(context), useRole(context, { role: 'dialog' })]);
  const voice = useVoice(lang);
  if (!term) return null;

  const tr = (k: string) => t(lang, k);
  const below = placement.startsWith('bottom');
  const tailX = middlewareData.arrow?.x;

  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="nt-cloud-wrap"
          lang={lang}
          aria-labelledby="nt-cloud-word"
          {...getFloatingProps()}
        >
          <div className={`nt-cloud ${below ? 'is-below' : 'is-above'}`}>
            <div className="nt-cloud-head">
              <h3 id="nt-cloud-word" className="nt-cloud-word">{tr(term.word)}</h3>
              {voice && (
                <button
                  className="nt-icon-btn"
                  aria-label={tr('news.ui.speak')}
                  onClick={() => speak(`${tr(term.word)}. ${tr(term.simple)}`, voice)}
                >
                  <svg viewBox="0 0 8 8" width="20" height="20" aria-hidden="true" shapeRendering="crispEdges">
                    <path fill="currentColor" d="M0 3h2v2H0zM2 2h1v4H2zM3 1h1v6H3zM5 2h1v1H5zM5 5h1v1H5zM6 3h1v2H6z" />
                  </svg>
                </button>
              )}
              <button className="nt-icon-btn" aria-label={tr('news.ui.cloud.close')} onClick={onClose}>
                <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
                  <path fill="currentColor" d="M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM4 4h1v1H4zM1 5h1v1H1zM5 5h1v1H5zM0 6h1v1H0zM6 6h1v1H6z" />
                </svg>
              </button>
            </div>
            <p className="nt-cloud-simple">{tr(term.simple)}</p>
            <p className="nt-cloud-example">
              <span className="nt-cloud-label">{tr('news.ui.cloud.example')}: </span>
              {tr(term.example)}
            </p>
            <p className="nt-cloud-saved">{tr('news.ui.cloud.saved')}</p>
          </div>
          {/* Two small puffs trailing toward the word: the "thought" in thought cloud. */}
          <span
            ref={tailRef}
            className={`nt-tail ${below ? 'is-below' : 'is-above'}`}
            style={{ left: tailX != null ? tailX : '50%' }}
            aria-hidden="true"
          >
            <span className="nt-puff nt-puff-big" />
            <span className="nt-puff nt-puff-small" />
          </span>
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}
