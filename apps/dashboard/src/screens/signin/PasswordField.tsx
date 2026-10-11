import { useState, type Ref } from 'react';
import { PASSWORD_MAX } from './signin';

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 'new-password' lets the browser offer to save it; 'current-password' to fill it in. */
  autoComplete: 'current-password' | 'new-password';
  /** The Show/Hide button: short visible words, and full names for screen readers. */
  toggle: { show: string; hide: string; showName: string; hideName: string };
  hint?: string;
  invalid?: boolean;
  /** Id of the error banner, read out with the field. */
  errorId?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/** A password box with a Show/Hide button, so nobody has to type a password blind. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  toggle,
  hint,
  invalid,
  errorId,
  inputRef,
}: Props) {
  const [shown, setShown] = useState(false);
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, errorId ?? null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-row">
        <input
          id={id}
          ref={inputRef}
          className="input"
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={PASSWORD_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="btn"
          aria-controls={id}
          aria-label={shown ? toggle.hideName : toggle.showName}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? toggle.hide : toggle.show}
        </button>
      </div>
      {hint && (
        <p id={hintId} className="muted">
          {hint}
        </p>
      )}
    </div>
  );
}
