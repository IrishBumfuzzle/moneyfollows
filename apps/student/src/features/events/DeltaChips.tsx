import { PixelIcon } from '../life/PixelIcon';
import type { IconId, LifeDelta } from '../life/types';
import { formatRupees, t } from './content';
import type { Lang } from './content';

interface Chip {
  key: string;
  icon: IconId;
  label: string;
  text: string;
  up: boolean;
}

const sign = (n: number) => (n > 0 ? '+' : '−');

/** What a choice changed: one chip per meter that moved, icon + label + signed number. */
export function DeltaChips({ lang, delta }: { lang: Lang; delta: LifeDelta }) {
  const chips: Chip[] = [];
  if (delta.money) chips.push({ key: 'money', icon: 'coin', label: 'events.ui.money', text: `${sign(delta.money)}${formatRupees(delta.money)}`, up: delta.money > 0 });
  if (delta.health) chips.push({ key: 'health', icon: 'heart', label: 'events.ui.health', text: `${sign(delta.health)}${Math.abs(delta.health)}`, up: delta.health > 0 });
  if (delta.sanity) chips.push({ key: 'sanity', icon: 'smile', label: 'events.ui.sanity', text: `${sign(delta.sanity)}${Math.abs(delta.sanity)}`, up: delta.sanity > 0 });
  // Borrowing is "down" (you owe more); repaying is "up".
  if (delta.debt) chips.push({ key: 'debt', icon: 'sack', label: 'events.ui.debt', text: `${sign(delta.debt)}${formatRupees(delta.debt)}`, up: delta.debt < 0 });
  if (chips.length === 0) return null;
  return (
    <ul className="ev-chips">
      {chips.map((c) => (
        <li key={c.key} className={`ev-chip ${c.up ? 'is-up' : 'is-down'}`}>
          <PixelIcon id={c.icon} />
          <span>{t(lang, c.label)}</span>
          <span className="ev-chip-num">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}
