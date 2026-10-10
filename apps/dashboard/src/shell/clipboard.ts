/**
 * Copies text. navigator.clipboard needs https or localhost, so a demo over a laptop's LAN address
 * falls back to a hidden textarea. Resolves false if neither works.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // blocked by permissions: try the fallback below
  }
  const before = document.activeElement as HTMLElement | null;
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(box);
  try {
    box.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    box.remove();
    before?.focus?.();
  }
}
