import type { ApiClient, ClassRow } from '@paisa/api-client';
import type { Lang } from './i18n';
import type { ClassPatch } from './screens/classes/classes';

/** Props every per-class screen receives from the shell (App.tsx). */
export interface ClassScreenProps {
  api: ApiClient;
  cls: ClassRow;
  lang: Lang;
  /** Call with a whole class that was created or replaced, so the shell and other screens see it. */
  onClassChange: (cls: ClassRow) => void;
  /** Call after a settings change with just the fields that changed; the shell merges them into its latest row. */
  onClassPatch: (id: string, patch: ClassPatch) => void;
}
