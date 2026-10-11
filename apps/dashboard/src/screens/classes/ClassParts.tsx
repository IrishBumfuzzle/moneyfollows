import { QRCodeSVG } from 'qrcode.react';
import type { ClassRow } from '@paisa/api-client';
import { joinUrl, studentUrlConfigured } from '../../api';
import { t } from '../../content';
import type { Lang } from '../../i18n';
import { CopyButton } from './CopyButton';
import { formatCode } from './classes';

/** Status chips: a symbol and words, never colour alone. */
export function StatusChips({ cls, lang }: { cls: ClassRow; lang: Lang }) {
  return (
    <ul className="chips" aria-label={cls.name}>
      <li className={`badge ${cls.join_open ? 'good' : 'bad'}`}>
        <span aria-hidden="true">{cls.join_open ? '✓' : '✕'}</span>
        {t(lang, cls.join_open ? 'class.join_open' : 'class.join_closed')}
      </li>
      <li className={`badge ${cls.endline_open ? 'good' : ''}`}>
        <span aria-hidden="true">{cls.endline_open ? '✓' : '–'}</span>
        {t(lang, cls.endline_open ? 'class.endline_open' : 'class.endline_closed')}
      </li>
    </ul>
  );
}

/** The class code in large letters, with Copy buttons for the code and (when the student app's address is set) the join link. */
export function CodeBlock({ cls, lang, label = true }: { cls: ClassRow; lang: Lang; label?: boolean }) {
  return (
    <div className="code-block">
      {label && <p className="muted">{t(lang, 'class.code')}</p>}
      <div className="class-code" translate="no">
        {formatCode(cls.class_code)}
      </div>
      <div className="btn-row">
        <CopyButton
          text={cls.class_code}
          label={t(lang, 'class.copy_code')}
          doneLabel={t(lang, 'class.copied_code')}
          failLabel={t(lang, 'class.copy_failed')}
        />
        {studentUrlConfigured && (
          <CopyButton
            text={joinUrl(cls.class_code)}
            label={t(lang, 'class.copy_link')}
            doneLabel={t(lang, 'class.copied_link')}
            failLabel={t(lang, 'class.copy_failed')}
          />
        )}
      </div>
    </div>
  );
}

/**
 * A QR for the join link, with the link as text underneath for anyone who can't scan. `big` is sized
 * for a projector, so a whole room can scan it. Nothing without the student app's address.
 */
export function JoinQr({ cls, lang, big = false }: { cls: ClassRow; lang: Lang; big?: boolean }) {
  if (!studentUrlConfigured) return null;
  const url = joinUrl(cls.class_code);
  return (
    <figure className={big ? 'qr big' : 'qr'}>
      <QRCodeSVG
        value={url}
        size={big ? 280 : 140}
        level="M"
        marginSize={2}
        bgColor="#ffffff"
        fgColor="#000000"
        title={t(lang, 'class.qr_title', { name: cls.name })}
      />
      <figcaption>
        <strong>{t(lang, 'class.scan')}</strong>
        <a className="join-link" href={url} target="_blank" rel="noreferrer" translate="no">
          {url}
        </a>
      </figcaption>
    </figure>
  );
}
