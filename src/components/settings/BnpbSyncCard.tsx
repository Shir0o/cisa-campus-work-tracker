import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { isAppOwner } from '../../lib/permissions';

interface TokenStatus {
  active: boolean;
  createdAt: string | null;
  lastPushAt: string | null;
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

/**
 * Settings card for connecting BNPB (ADR 0037, #1420). Rendered only for the
 * app owner; everyone else never sees it.
 */
export default function BnpbSyncCard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const owner = isAppOwner(user?.email);

  const [status, setStatus] = useState<TokenStatus>({ active: false, createdAt: null, lastPushAt: null });
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<'generate' | 'revoke' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const call = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const idToken =
        user && typeof user.getIdToken === 'function' ? await user.getIdToken() : '';
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'request failed');
      return body;
    },
    [user],
  );

  const load = useCallback(async () => {
    try {
      const body = await call('/api/bnpb/token');
      setStatus({
        active: !!body.active,
        createdAt: body.createdAt ?? null,
        lastPushAt: body.lastPushAt ?? null,
      });
    } catch {
      // Leave the card in its not-connected state; the buttons still work.
    }
  }, [call]);

  useEffect(() => {
    if (owner) void load();
  }, [owner, load]);

  if (!owner) return null;

  const generate = async () => {
    setBusy('generate');
    setError(null);
    setCopied(false);
    try {
      const body = await call('/api/bnpb/token', { method: 'POST' });
      setToken(body.token as string);
      setStatus({ active: true, createdAt: body.createdAt ?? null, lastPushAt: status.lastPushAt });
    } catch {
      setError(t('bnpb.error_generic'));
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    setBusy('revoke');
    setError(null);
    setCopied(false);
    try {
      await call('/api/bnpb/token/revoke', { method: 'POST' });
      setToken(null);
      setStatus({ active: false, createdAt: null, lastPushAt: null });
    } catch {
      setError(t('bnpb.error_generic'));
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setError(t('bnpb.error_generic'));
    }
  };

  const created = formatWhen(status.createdAt);
  const lastPush = formatWhen(status.lastPushAt);

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="font-serif text-2xl text-on-surface">{t('bnpb.settings_title')}</h2>
        <p className="text-sm text-on-surface-variant mt-1 max-w-2xl leading-relaxed">
          {t('bnpb.settings_sub')}
        </p>
      </div>

      <div className="rounded-3xl border border-outline-variant/40 bg-surface-container p-5 max-w-2xl">
        <div className="flex items-start gap-3">
          <div className="flex-none w-10 h-10 rounded-full bg-accent-soft text-stage-accent flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-on-surface">
              {status.active ? t('bnpb.token_active') : t('bnpb.token_inactive')}
            </div>
            <div className="text-[13px] text-on-surface-variant mt-0.5">
              {created ? t('bnpb.token_created').replace('{date}', created) : t('bnpb.token_inactive_help')}
            </div>
            {status.active && (
              <div className="text-[13px] text-on-surface-variant mt-0.5">
                {lastPush ? t('bnpb.token_last_push').replace('{date}', lastPush) : t('bnpb.token_never_pushed')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={generate}
              disabled={busy !== null}
              className="px-3.5 py-2 rounded-full bg-primary text-on-primary text-[13px] font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {t('bnpb.generate')}
            </button>
            {status.active && (
              <button
                type="button"
                onClick={revoke}
                disabled={busy !== null}
                className="px-3.5 py-2 rounded-full border border-outline-variant text-on-surface text-[13px] font-medium flex items-center gap-1.5 hover:bg-surface transition-colors disabled:opacity-50"
              >
                {busy === 'revoke' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {t('bnpb.revoke')}
              </button>
            )}
          </div>
        </div>

        {token && (
          <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <p className="text-[13px] text-on-surface-variant">{t('bnpb.token_once')}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-xl bg-surface border border-outline-variant px-3 py-2 text-[13px] text-on-surface">
                {token}
              </code>
              <button
                type="button"
                onClick={copy}
                className="shrink-0 px-3 py-2 rounded-xl bg-primary text-on-primary text-[13px] font-medium flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t('bnpb.copied') : t('bnpb.copy')}
              </button>
            </div>
            <p className="text-[12px] text-on-surface-variant mt-2">{t('bnpb.token_help')}</p>
          </div>
        )}

        {error && <p className="text-[13px] text-error mt-3">{error}</p>}
      </div>
    </section>
  );
}
