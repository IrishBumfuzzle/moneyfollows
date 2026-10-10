import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, ClassRow } from '@paisa/api-client';
import { mergeClass, patchClassRow, type ClassPatch } from '../screens/classes/classes';

/** The signed-in facilitator's classes (RLS hides everyone else's), newest first, shared by every screen. */
export function useClasses(api: ApiClient) {
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    api
      .listClasses()
      .then((rows) => alive && setClasses(rows))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [api, attempt]);

  /** Adds a new class or replaces a changed one, so a settings change shows on every screen. */
  const upsert = useCallback((cls: ClassRow) => setClasses((prev) => mergeClass(prev ?? [], cls)), []);
  /** Merges changed fields into the latest row (a functional update), so overlapping saves never undo each other. */
  const patchClass = useCallback(
    (id: string, patch: ClassPatch) => setClasses((prev) => prev && patchClassRow(prev, id, patch)),
    [],
  );
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { classes, failed, loading: classes === null && !failed, upsert, patchClass, reload };
}
