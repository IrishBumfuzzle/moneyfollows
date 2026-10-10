// Import first: captures a failed invite link in the URL hash before supabase-js clears it.
import { AUTH_LINK_ERROR } from './shell/initialHash';
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '@paisa/api-client';
import { api } from './api';
import { t } from './content';
import { saveLang, savedLang, type Lang } from './i18n';
import { ProgressScreen } from './screens/progress/ProgressScreen';
import { ClassesScreen } from './screens/classes/ClassesScreen';
import { SettingsScreen } from './screens/classes/SettingsScreen';
import { SignIn } from './screens/signin/SignIn';
import { ClassLayout } from './shell/ClassLayout';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { Failed, Loading, NotStaff, SetupCard } from './shell/Notices';
import { TopBar } from './shell/TopBar';
import { useFocusHeading } from './shell/focus';
import { routeKey } from './shell/route';
import { useAuth } from './shell/useAuth';
import { useClasses } from './shell/useClasses';
import { useHashRoute } from './shell/useHashRoute';

// Recharts is the heaviest dependency; staff who only manage classes never download it.
const GainsScreen = lazy(() => import('./screens/gains/GainsScreen').then((m) => ({ default: m.GainsScreen })));

export function App() {
  const [lang, setLangState] = useState<Lang>(savedLang);
  const setLang = useCallback((next: Lang) => {
    saveLang(next);
    setLangState(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  if (!api) {
    return (
      <>
        <TopBar lang={lang} onLang={setLang} />
        <main id="main" className="page">
          <SetupCard lang={lang} />
        </main>
      </>
    );
  }
  return <Gate api={api} lang={lang} onLang={setLang} />;
}

/** Sign-in state: loading, signed out, signed in but not staff, or the workspace. */
function Gate({ api, lang, onLang }: { api: ApiClient; lang: Lang; onLang: (lang: Lang) => void }) {
  const { state, refresh, recheck } = useAuth(api);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [linkError, setLinkError] = useState(AUTH_LINK_ERROR);
  const email = 'email' in state ? state.email : undefined;

  // The workspace moves focus itself once its classes have loaded.
  const waiting = state.status === 'loading' || state.status === 'checking';
  useFocusHeading(state.status, !waiting && state.status !== 'staff');

  const signOut = useCallback(async () => {
    setSignOutFailed(false);
    try {
      await api.signOut();
      if (await api.currentEmail()) setSignOutFailed(true);
    } catch {
      setSignOutFailed(true);
    }
    refresh();
  }, [api, refresh]);

  return (
    <>
      <TopBar lang={lang} onLang={onLang} email={email} onSignOut={email ? () => void signOut() : undefined} />
      <main id="main" className="page">
        {signOutFailed && (
          <div className="banner bad" role="alert">
            <span aria-hidden="true">!</span>
            <span>{t(lang, 'topbar.sign_out_failed')}</span>
          </div>
        )}
        {state.status === 'loading' && <Loading text={t(lang, 'loading.session')} />}
        {state.status === 'out' && (
          <SignIn
            api={api}
            lang={lang}
            linkError={linkError}
            onSignedIn={() => {
              setLinkError(false);
              refresh();
            }}
          />
        )}
        {state.status === 'checking' && <Loading text={t(lang, 'loading.staff')} />}
        {state.status === 'failed' && (
          <Failed text={t(lang, 'staffcheck.failed')} retryLabel={t(lang, 'classes.retry')} onRetry={recheck} />
        )}
        {state.status === 'not_staff' && <NotStaff email={state.email} lang={lang} onRecheck={recheck} />}
        {state.status === 'staff' && (
          <ErrorBoundary text={t(lang, 'app.crash')} reloadLabel={t(lang, 'app.reload')}>
            <Workspace api={api} lang={lang} />
          </ErrorBoundary>
        )}
      </main>
    </>
  );
}

/** Signed-in staff: the class list, or one class with its Progress / Learning gains / Settings tabs. */
function Workspace({ api, lang }: { api: ApiClient; lang: Lang }) {
  const { route, replace } = useHashRoute();
  const { classes, failed, loading, upsert, patchClass, reload } = useClasses(api);
  const cls = route.name === 'class' ? classes?.find((c) => c.id === route.id) : undefined;
  const unknownClass = route.name === 'class' && classes !== null && !cls;

  // A class id that is not yours (or not there any more) goes back to the list.
  useEffect(() => {
    if (unknownClass) replace({ name: 'classes' });
  }, [unknownClass, replace]);

  useFocusHeading(routeKey(route), classes !== null && !unknownClass);

  if (loading) return <Loading text={t(lang, 'classes.loading')} />;
  if (failed || !classes) {
    return <Failed text={t(lang, 'classes.err.load')} retryLabel={t(lang, 'classes.retry')} onRetry={reload} />;
  }

  if (route.name === 'classes') {
    return <ClassesScreen api={api} lang={lang} classes={classes} onClassChange={upsert} />;
  }
  if (!cls) return null;

  const props = { api, cls, lang, onClassChange: upsert, onClassPatch: patchClass };
  return (
    <ClassLayout cls={cls} tab={route.tab} lang={lang}>
      {/* Inside the layout, so a failed tab keeps the tabs and back link; a new route tries again. */}
      <ErrorBoundary text={t(lang, 'app.crash')} reloadLabel={t(lang, 'app.reload')} resetKey={routeKey(route)}>
        {route.tab === 'progress' && <ProgressScreen key={cls.id} {...props} />}
        {route.tab === 'gains' && (
          <Suspense fallback={<Loading text={t(lang, 'app.loading')} />}>
            <GainsScreen key={cls.id} {...props} />
          </Suspense>
        )}
        {route.tab === 'settings' && <SettingsScreen key={cls.id} {...props} />}
      </ErrorBoundary>
    </ClassLayout>
  );
}
