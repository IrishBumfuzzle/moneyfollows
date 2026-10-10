// Sample mode: ?demo=1 (the student app's demo switch, CLAUDE.md 9) runs the dashboard on a made-up
// school inside the browser. No backend, no invite, nothing saved: for judges, demos and staff training.
const PARAM = 'demo';

export function isSampleSearch(search: string): boolean {
  const v = new URLSearchParams(search).get(PARAM);
  return v !== null && v !== '0' && v !== 'false';
}

export const SAMPLE_MODE = typeof window !== 'undefined' && isSampleSearch(window.location.search);

/** This page's address with sample mode switched on or off, starting at the class list. */
export function sampleModeHref(on: boolean): string {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set(PARAM, '1');
  else url.searchParams.delete(PARAM);
  return `${url.pathname}${url.search}`;
}
