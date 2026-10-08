// The "Share link" dialog for a coordination doc (issue #1023), now in the
// shared popup frame (spec #1444, ticket #1451). A guest link is a secret key
// on one page; this is the only place a Full-timer can mint, change, rotate, or
// kill it. Copy is the whole UX for handing the link out. The frame turns the
// dialog into a bottom sheet under 768 px and pins Cancel + the one primary
// action (Create guest link while sharing is off, Done once it is on).
import { useState } from 'react';
import { Check, Copy, Link2, Lock, RefreshCw, Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '../LanguageProvider';
import { audienceOf, guestAccessUrl, type BoardDoc, type GuestPermission } from '../../lib/board';
import { enableGuestAccess, regenerateGuestAccess, revokeGuestAccess, setGuestPermission } from '../../lib/data/board';
import { cn } from '../../lib/utils';
import { PopupFrame } from '../ui/PopupFrame';

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
    <PopupFrame
      open
      onClose={onClose}
      size="sm"
      eyebrow={t('coordination.share.button')}
      title={t('coordination.share.title')}
      subtitle={t('coordination.share.subtitle')}
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      primary={
        enabled
          ? {
              label: t('actions.done'),
              onClick: onClose,
              savingLabel: t('modals.saving'),
            }
          : {
              label: t('coordination.share.enable'),
              onClick: enable,
              saving: busy,
              savingLabel: t('modals.saving'),
            }
      }
    >
      <div className="space-y-4 px-7 py-5">
        {teamOnly && (
          <div className="flex items-start gap-2 rounded border border-stage-amber/40 bg-stage-amber-soft px-3 py-2 text-xs text-on-surface">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{t('coordination.share.team_warning', 'This page is Team only. Anyone with the link can read the notes on it.')}</span>
          </div>
        )}

        {enabled ? (
          <>
            <div className="inline-flex rounded-[10px] border border-outline-variant p-0.5">
              {(['view', 'edit'] as GuestPermission[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy}
                  onClick={() => changePermission(p)}
                  className={cn(
                    'rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors',
                    permission === p ? 'bg-primary/10 text-accent' : 'text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {p === 'view' ? t('coordination.share.can_view', 'Can view') : t('coordination.share.can_edit', 'Can edit')}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[13px] font-medium text-on-surface" htmlFor="guest-link-url">
                {t('coordination.share.link_label', 'Guest link')}
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="guest-link-url"
                  readOnly
                  value={url}
                  className="min-w-0 flex-1 rounded-sm border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface"
                />
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-medium text-on-primary transition-opacity hover:opacity-90"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t('coordination.share.copied', 'Copied') : t('coordination.share.copy', 'Copy')}
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded border border-outline-variant bg-white p-3" data-testid="guest-link-qr-code">
              <QRCodeSVG value={url} size={144} />
              <p className="mt-2 text-[11px] text-[var(--text-mute)]">
                {t('coordination.share.scan_qr_prompt', 'Scan to open on a phone or tablet')}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={regenerate}
                className="inline-flex items-center gap-1.5 rounded-sm border border-outline-variant px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:border-accent-line hover:text-accent disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {t('coordination.share.regenerate', 'Regenerate link')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={revoke}
                className="inline-flex items-center gap-1.5 rounded-sm border border-error/40 px-3 py-2 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
              >
                {t('coordination.share.revoke', 'Revoke link')}
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-2 text-sm text-on-surface-variant">
            <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{t('coordination.share.off_body', 'Sharing is off. Create a link to let outside collaborators view or edit this page.')}</span>
          </div>
        )}

        {error && <p role="alert" className="text-xs text-error">{error}</p>}
      </div>
    </PopupFrame>
  );
}
