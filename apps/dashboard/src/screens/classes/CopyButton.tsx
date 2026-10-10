import { useEffect, useRef, useState } from 'react';
import { copyText } from '../../shell/clipboard';

interface Props {
  text: string;
  label: string;
  doneLabel: string;
  failLabel: string;
}

/** Copies `text`; the button says so for a couple of seconds, and a live region tells screen readers too. */
export function CopyButton({ text, label, doneLabel, failLabel }: Props) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    setState((await copyText(text)) ? 'done' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2500);
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => void copy()}>
        {state === 'done' && <span aria-hidden="true">✓</span>}
        {state === 'done' ? doneLabel : label}
      </button>
      <span className="sr-only" role="status">
        {state === 'done' ? doneLabel : state === 'failed' ? failLabel : ''}
      </span>
      {state === 'failed' && (
        <span className="copy-failed" aria-hidden="true">
          {failLabel}
        </span>
      )}
    </>
  );
}
