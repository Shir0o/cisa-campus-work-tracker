import React, { useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { postCombineApi } from '../../lib/combineClient';
import { purgeTotal, type PurgePlan } from '../../lib/testAccountPurge';
import { PopupFrame } from '../ui/PopupFrame';
import { useLanguage } from '../LanguageProvider';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (deletedCount: number) => void;
}

type Step = 'preview' | 'purging' | 'done';

const PURGE_API = '/api/test-account-purge';

/** The preview rows, in display order; contacts are shown under the opt-in. */
const ROWS: { group: Exclude<keyof PurgePlan, 'keptSelf'>; label: string }[] = [
  { group: 'accounts', label: 'testAccountPurge.test_accounts' },
  { group: 'logins', label: 'testAccountPurge.sign_in_logins' },
  { group: 'invitations', label: 'testAccountPurge.pending_invitations' },
  { group: 'personal', label: 'testAccountPurge.personal' },
  { group: 'interactions', label: 'testAccountPurge.interaction_logs' },
  { group: 'notes', label: 'testAccountPurge.notes' },
  { group: 'chats', label: 'testAccountPurge.chats' },
  { group: 'activity', label: 'testAccountPurge.activity' },
  { group: 'asks', label: 'testAccountPurge.asks' },
  { group: 'feedback', label: 'testAccountPurge.feedback' },
  { group: 'contacts', label: 'testAccountPurge.contacts_created' },
];

export default function TestAccountPurgeModal({ isOpen, onClose, onSuccess }: Props) {
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>('preview');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PurgePlan | null>(null);
  const [deleteTestContacts, setDeleteTestContacts] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Scan on open
  React.useEffect(() => {
    if (!isOpen) {
      setStep('preview');
      setPlan(null);
      setError(null);
      return;
    }

    let isMounted = true;
    const runScan = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await postCombineApi<{ plan: PurgePlan }>(
          PURGE_API,
          { dryRun: true },
          'Failed to scan test accounts.',
        );
        if (isMounted) {
          setPlan(res.plan);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to scan test accounts.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    runScan();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePurge = async () => {
    if (!plan) return;
    setStep('purging');
    setError(null);
    try {
      const res = await postCombineApi<{ deletedCount: number; failed: unknown[] }>(
        PURGE_API,
        { deleteTestContacts },
        'Failed to purge test account traces.',
      );
      setDeletedCount(res.deletedCount);
      setFailedCount(res.failed?.length ?? 0);
      setStep('done');
      if (onSuccess) onSuccess(res.deletedCount);
    } catch (err: any) {
      setError(err?.message || 'Failed to purge test account traces.');
      setStep('preview');
    }
  };

  const totalToDelete = plan ? purgeTotal(plan, deleteTestContacts) : 0;

  return (
    <PopupFrame
      open
      onClose={onClose}
      size="sm"
      eyebrow={t('testAccountPurge.eyebrow')}
      title={t('testAccountPurge.title')}
      subtitle={t('testAccountPurge.subtitle')}
      cancelLabel={t('actions.cancel')}
      onCancel={onClose}
      primary={
        step === 'done'
          ? { label: t('actions.done'), onClick: onClose, savingLabel: t('actions.saving') }
          : {
              label: t('testAccountPurge.purge'),
              onClick: handlePurge,
              disabled: totalToDelete === 0,
              saving: step === 'purging',
              savingLabel: t('testAccountPurge.purging'),
            }
      }
    >
      <div className="space-y-4 px-7 py-5">
        {error && (
          <div className="rounded border border-error/30 bg-error/10 p-3 text-xs text-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-on-surface-variant">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">{t('testAccountPurge.scanning')}</p>
          </div>
        ) : step === 'preview' ? (
          <div className="space-y-4">
            <div className="space-y-2.5 rounded border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface">
              {ROWS.map(({ group, label }, i) => (
                <div
                  key={group}
                  className={`flex items-center justify-between py-1${
                    i < ROWS.length - 1 ? ' border-b border-outline-variant' : ''
                  }`}
                >
                  <span className="text-on-surface-variant">{t(label)}</span>
                  <span className="font-semibold">{plan?.[group].length ?? 0}</span>
                </div>
              ))}
            </div>

            {plan && plan.contacts.length > 0 && (
              <label className="flex cursor-pointer select-none items-start gap-3 rounded border border-outline-variant bg-surface-container-low p-3">
                <input
                  type="checkbox"
                  checked={deleteTestContacts}
                  onChange={(e) => setDeleteTestContacts(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-error text-error focus:ring-error"
                />
                <div className="text-xs leading-relaxed text-on-surface-variant">
                  <span className="block font-medium text-on-surface">
                    {t('testAccountPurge.also_delete_contacts').replace(
                      '{n}',
                      String(plan.contacts.length),
                    )}
                  </span>
                  {t('testAccountPurge.contacts_note')}
                </div>
              </label>
            )}

            {plan && plan.keptSelf.length > 0 && (
              <p className="text-xs text-on-surface-variant">
                {t('testAccountPurge.kept_self').replace('{who}', plan.keptSelf.join(', '))}
              </p>
            )}

            <div className="flex items-center gap-2 rounded border border-error/20 bg-error/5 p-3 text-xs text-on-surface-variant">
              <AlertTriangle className="h-4 w-4 shrink-0 text-error" />
              <span>{t('testAccountPurge.delete_warning').replace('{n}', String(totalToDelete))}</span>
            </div>
          </div>
        ) : step === 'purging' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-on-surface-variant">
            <Loader2 className="h-8 w-8 animate-spin text-error" />
            <p className="text-sm">{t('testAccountPurge.purging_records')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4 py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <div>
              <h4 className="font-serif text-lg text-on-surface">{t('testAccountPurge.complete')}</h4>
              <p className="mt-1 text-sm text-on-surface-variant">
                {t('testAccountPurge.removed').replace('{n}', String(deletedCount))}
              </p>
              {failedCount > 0 && (
                <p className="mt-1 text-sm text-error">
                  {t('testAccountPurge.partial').replace('{n}', String(failedCount))}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </PopupFrame>
  );
}
