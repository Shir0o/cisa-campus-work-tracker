// The "Share link" dialog for a coordination doc (issue #1023). A guest link is
// a secret key on one page; this is the only place a Full-timer can mint, change,
// rotate, or kill it. Copy is the whole UX for handing the link out.
import { useState } from 'react';
import { Check, Copy, Link2, Lock, RefreshCw, Users, X } from 'lucide-react';
import { useLanguage } from '../LanguageProvider';
import { audienceOf, guestAccessUrl, type BoardDoc, type GuestPermission } from '../../lib/board';
import { enableGuestAccess, regenerateGuestAccess, revokeGuestAccess, setGuestPermission } from '../../lib/data/board';
import { cn } from '../../lib/utils';

// A zero-arg async action the dialog can await while it shows a busy state.
interface AsyncWork {
  (): Promise<void>;
}

export default function ShareDocModal({
  doc,
  currentUserId,
  onClose,
}: {
  doc: BoardDoc;
  currentUserId: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const access = doc.guestAccess;
  const enabled = Boolean(access && access.enabled && access.key);
  // A missing or malformed config is treated as view-only, the safe default.
  const permission: GuestPermission = access?.permission === 'edit' ? 'edit' : 'view';
  const url = enabled ? guestAccessUrl(window.location.origin, doc.id, access?.key || '') : '';
  const teamOnly = audienceOf(doc) === 'team';

  const run = async (work: AsyncWork) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError(t('coordination.share.save_failed', 'Could not update the link. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const enable = () => run(() => enableGuestAccess(doc, 'view', currentUserId));
  const changePermission = (next: GuestPermission) => run(() => setGuestPermission(doc, next, currentUserId));
  const regenerate = () => run(() => regenerateGuestAccess(doc, permission, currentUserId));
  const revoke = () => run(() => revokeGuestAccess(doc, currentUserId));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('coordination.share.copy_failed', 'Copy failed. Select the link and copy it manually.'));
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('coordination.share.close', 'Close')}
        onClick={onClose}
        className="fixed inset-0 bg-scrim/55 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('coordination.share.title', 'Share link')}
        className="relative w-full max-w-lg rounded-2xl border border-outline-variant bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-on-surface">{t('coordination.share.title', 'Share link')}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {t('coordination.share.subtitle', 'Anyone with the link can open this page without an account.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('coordination.share.close', 'Close')}
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-variant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {teamOnly && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-stage-amber/40 bg-stage-amber-soft px-3 py-2 text-xs text-on-surface">
            <Lock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            <span>{t('coordination.share.team_warning', 'This page is Team only. Anyone with the link can read the pastoral notes on it.')}</span>
          </div>
        )}

        <div className="mt-5">
          {enabled ? (
            <>
              <div className="inline-flex rounded-lg border border-outline-variant p-0.5">
                {(['view', 'edit'] as GuestPermission[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busy}
                    onClick={() => changePermission(p)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      permission === p ? 'bg-stage-accent-soft text-stage-accent' : 'text-on-surface-variant hover:text-on-surface',
                    )}
                  >
                    {p === 'view' ? t('coordination.share.can_view', 'Can view') : t('coordination.share.can_edit', 'Can edit')}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-xs font-medium text-on-surface-variant" htmlFor="guest-link-url">
                {t('coordination.share.link_label', 'Guest link')}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="guest-link-url"
                  readOnly
                  value={url}
                  className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-background px-3 py-2 text-xs text-on-surface"
                />
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-stage-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t('coordination.share.copied', 'Copied') : t('coordination.share.copy', 'Copy')}
                </button>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={regenerate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:border-stage-accent/40 hover:text-stage-accent disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> {t('coordination.share.regenerate', 'Regenerate link')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={revoke}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-error/40 px-3 py-2 text-xs font-medium text-error transition-colors hover:bg-error-container disabled:opacity-50"
                >
                  {t('coordination.share.revoke', 'Revoke link')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2 text-sm text-on-surface-variant">
                <Users className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                <span>{t('coordination.share.off_body', 'Sharing is off. Create a link to let outside collaborators view or edit this page.')}</span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={enable}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-stage-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Link2 className="w-4 h-4" /> {t('coordination.share.enable', 'Create guest link')}
              </button>
            </>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-error">{error}</p>}
      </div>
    </div>
  );
}
