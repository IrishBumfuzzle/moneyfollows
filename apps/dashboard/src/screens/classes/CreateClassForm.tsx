import { useRef, useState, type FormEvent } from 'react';
import type { ApiClient, ClassRow } from '@paisa/api-client';
import { t } from '../../content';
import { LANGS, type Lang } from '../../i18n';
import { NAME_MAX, validateClassName } from './classes';

interface Props {
  api: ApiClient;
  lang: Lang;
  onCreated: (cls: ClassRow) => void;
}

export function CreateClassForm({ api, lang, onCreated }: Props) {
  const tr = (key: string) => t(lang, key);
  const [name, setName] = useState('');
  // Only English and Hindi ship (CLAUDE.md 7.4), so those are the only choices.
  const [defaultLang, setDefaultLang] = useState<Lang>(lang);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = validateClassName(name);
    if (problem) {
      setError(problem === 'empty' ? 'classes.create.err.empty' : 'classes.create.err.long');
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cls = await api.createClass(name.trim(), defaultLang);
      setName('');
      onCreated(cls);
    } catch {
      setError('classes.create.err.failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="create-title">
      <h2 id="create-title">{tr('classes.create.title')}</h2>
      <div className="form-row">
        <div className="field grow">
          <label htmlFor="class-name">{tr('classes.create.name')}</label>
          <input
            id="class-name"
            ref={nameRef}
            className="input"
            type="text"
            maxLength={NAME_MAX}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error === 'classes.create.err.empty' || error === 'classes.create.err.long' || undefined}
            aria-describedby={error ? 'class-name-error' : 'class-name-hint'}
          />
          <span id="class-name-hint" className="muted">
            {tr('classes.create.name_hint')}
          </span>
        </div>
        <div className="field">
          <label htmlFor="class-lang">{tr('classes.create.lang')}</label>
          <select
            id="class-lang"
            className="input"
            value={defaultLang}
            onChange={(e) => setDefaultLang(e.target.value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {tr(`lang.${l}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="banner bad" id="class-name-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{tr(error)}</span>
        </div>
      )}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? tr('classes.create.creating') : tr('classes.create.submit')}
        </button>
      </div>
    </form>
  );
}
