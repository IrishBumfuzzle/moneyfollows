import type { ApiClient, ClassRow } from '@paisa/api-client';
import type { Lang } from './i18n';
import type { ClassPatch } from './screens/classes/classes';

/**
 * The part of the api-client the dashboard uses. The real client (Supabase) and the sample-mode
 * client (src/sample/sampleApi.ts) both provide it, so screens never know which one they have.
 */
export type DashboardApi = Pick<
  ApiClient,
  | 'signInWithPassword'
  | 'signUpWithPassword'
  | 'sendPasswordReset'
  | 'verifyPasswordReset'
  | 'setPassword'
  | 'signOut'
  | 'currentEmail'
  | 'onAuthChange'
  | 'isStaff'
  | 'listClasses'
  | 'createClass'
  | 'setJoinOpen'
  | 'rotateClassCode'
  | 'setEndlineOpen'
  | 'listStudents'
  | 'resetRejoinCode'
  | 'classProgress'
  | 'learningGain'
  | 'classroomQuizSummary'
>;

/** Props every per-class screen receives from the shell (App.tsx). */
export interface ClassScreenProps {
  api: DashboardApi;
  cls: ClassRow;
  lang: Lang;
  /** Call with a whole class that was created or replaced, so the shell and other screens see it. */
  onClassChange: (cls: ClassRow) => void;
  /** Call after a settings change with just the fields that changed; the shell merges them into its latest row. */
  onClassPatch: (id: string, patch: ClassPatch) => void;
}
