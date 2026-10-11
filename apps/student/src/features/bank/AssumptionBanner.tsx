import { PixelIcon } from '../life/PixelIcon';

/**
 * Always shown next to any growth projection (CLAUDE.md 5.4, 7.2 rule 5): the numbers are
 * assumptions, not promises. The caller passes its own translated text.
 */
export function AssumptionBanner({ text }: { text: string }) {
  return (
    <p className="tm-assume" role="note">
      <PixelIcon id="warn" size={24} />
      <span>{text}</span>
    </p>
  );
}
