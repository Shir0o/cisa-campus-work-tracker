import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Trash2, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { db } from '../../lib/firebase';
import {
  scanTestAccountTraces,
  purgeTestAccountTraces,
  type PurgePlan,
} from '../../lib/testAccountPurge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (deletedCount: number) => void;
}

type Step = 'preview' | 'purging' | 'done';

export default function TestAccountPurgeModal({ isOpen, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('preview');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PurgePlan | null>(null);
  const [deleteTestContacts, setDeleteTestContacts] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
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
        const discovered = await scanTestAccountTraces(db);
        if (isMounted) {
          setPlan(discovered);
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
      const res = await purgeTestAccountTraces(db, plan, { deleteTestContacts });
      setDeletedCount(res.deletedCount);
      setStep('done');
      if (onSuccess) onSuccess(res.deletedCount);
    } catch (err: any) {
      setError(err?.message || 'Failed to purge test account traces.');
      setStep('preview');
    }
  };

  const totalToDelete =
    (plan?.testUsers.length || 0) +
    (plan?.invitations.length || 0) +
    (plan?.personalPrayers.length || 0) +
    (plan?.interactions.length || 0) +
    (deleteTestContacts ? plan?.contactsCreatedByTestAccounts.length || 0 : 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative w-full max-w-md bg-surface-container rounded-3xl border border-outline-variant/50 p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 rounded-full bg-error/10 text-error flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </span>
          <div>
            <h3 className="font-serif text-xl text-on-surface">Test Account Purge</h3>
            <p className="text-xs text-on-surface-variant">Dry run scan &amp; cleanup tool</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-error/30 bg-error/10 p-3 text-xs text-error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Scanning database for test account traces…</p>
          </div>
        ) : step === 'preview' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4 space-y-2.5 text-sm text-on-surface">
              <div className="flex justify-between items-center py-1 border-b border-outline-variant/20">
                <span className="text-on-surface-variant">Test accounts:</span>
                <span className="font-semibold">{plan?.testUsers.length ?? 0}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-outline-variant/20">
                <span className="text-on-surface-variant">Pending invitations:</span>
                <span className="font-semibold">{plan?.invitations.length ?? 0}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-outline-variant/20">
                <span className="text-on-surface-variant">Personal prayers:</span>
                <span className="font-semibold">{plan?.personalPrayers.length ?? 0}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-outline-variant/20">
                <span className="text-on-surface-variant">Interaction logs:</span>
                <span className="font-semibold">{plan?.interactions.length ?? 0}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-on-surface-variant">Contacts created by test accounts:</span>
                <span className="font-semibold">{plan?.contactsCreatedByTestAccounts.length ?? 0}</span>
              </div>
            </div>

            {plan && plan.contactsCreatedByTestAccounts.length > 0 && (
              <label className="flex items-start gap-3 p-3 rounded-xl border border-outline-variant/40 bg-surface-container-low cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteTestContacts}
                  onChange={(e) => setDeleteTestContacts(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-error focus:ring-error accent-error"
                />
                <div className="text-xs text-on-surface-variant leading-relaxed">
                  <span className="font-medium text-on-surface block">
                    Also delete contacts created exclusively by test accounts ({plan.contactsCreatedByTestAccounts.length})
                  </span>
                  Real teammate contacts and edits are always preserved.
                </div>
              </label>
            )}

            <div className="flex items-center gap-2 p-3 rounded-xl bg-error/5 border border-error/20 text-xs text-on-surface-variant">
              <AlertTriangle className="w-4 h-4 text-error shrink-0" />
              <span>
                Permanently deletes <strong className="text-on-surface">{totalToDelete}</strong> items. This action cannot be undone.
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-medium hover:bg-surface-variant transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurge}
                disabled={totalToDelete === 0}
                className="flex-1 py-3 rounded-xl bg-error text-white font-medium hover:bg-error/90 transition-colors flex items-center justify-center gap-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                Purge Traces
              </button>
            </div>
          </div>
        ) : step === 'purging' ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
            <Loader2 className="w-8 h-8 animate-spin text-error" />
            <p className="text-sm">Purging test account records…</p>
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
            <span className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7" />
            </span>
            <div>
              <h4 className="font-serif text-lg text-on-surface">Purge Complete</h4>
              <p className="text-sm text-on-surface-variant mt-1">
                Successfully removed {deletedCount} test account traces.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-primary text-on-primary font-medium hover:bg-primary/90 transition-colors text-sm"
            >
              Done
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
