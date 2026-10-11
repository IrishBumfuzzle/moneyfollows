import { Icon } from './icons';
import { JarDeltas } from './JarDelta';
import { choiceOfNote } from './plan';
import type { Landed } from './plan';
import { t } from './content';
import type { Lang } from './content';

/** A delayed effect landing now: the earlier choice it came from, what happens now, and the jar changes. */
export function FlashbackCard({ lang, name, item }: { lang: Lang; name: string; item: Landed[number] }) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, { name, ...vars });
  const from = choiceOfNote(item.note);
  return (
    <div className="dc-flash">
      <p className="dc-flash-head">
        <Icon name="wait" size={20} />
        {tr('dec.flash.title')}
      </p>
      {from && <p className="dc-muted">{tr('dec.flash.chose', { choice: tr(from.choice.label) })}</p>}
      <p>{tr(item.note)}</p>
      <JarDeltas lang={lang} applied={item.applied} />
    </div>
  );
}
