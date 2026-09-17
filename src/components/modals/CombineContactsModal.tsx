import React, { useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { X, Check, Users, ArrowRightLeft, Trash2, AlertCircle } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import {
  findCandidateDuplicates,
  combineContactProfiles,
  type DuplicatePair,
} from '../../lib/contactCombining';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import type { Contact } from '../../types';

interface CombineContactsModalProps {
  contacts: Contact[];
  onClose: () => void;
  onApplied?: () => void;
}

/**
 * Dry-run contact combining for the directory (Issue #1070 / ADR 0026).
 *
 * Scans contacts for candidate duplicates (matching email, phone, or name)
 * and presents a preview of each pair. Full-timers can review matches,
 * swap the survivor, dismiss false positives, and apply the merge transactionally.
 */
export default function CombineContactsModal({
  contacts,
  onClose,
  onApplied,
}: CombineContactsModalProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [applying, setApplying] = useState(false);

  // Initialize pairs from detector
  const initialPairs = useMemo(() => findCandidateDuplicates(contacts), [contacts]);
  const [pairs, setPairs] = useState<DuplicatePair[]>(initialPairs);

  const handleSwapSurvivor = (index: number) => {
    setPairs((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = {
        ...current,
        survivor: current.duplicate,
        duplicate: current.survivor,
      };
      return next;
    });
  };

  const handleDismissPair = (index: number) => {
    setPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApply = async () => {
    if (pairs.length === 0 || applying) return;
    setApplying(true);

    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const updatedByName =
        user?.displayName || user?.email?.split('@')[0] || t('modals.unknown_user', 'Unknown User');

      for (const pair of pairs) {
        const combined = combineContactProfiles(pair.survivor, pair.duplicate);

        // 1. Update survivor record with merged attributes
        const survivorRef = doc(db, 'contacts', pair.survivor.id);
        batch.update(survivorRef, {
          name: combined.name,
          role: combined.role,
          location: combined.location,
          email: combined.email,
          phone: combined.phone,
          stage: combined.stage,
          notes: combined.notes,
          spiritualBackground: combined.spiritualBackground,
          pronouns: combined.pronouns,
          gender: combined.gender,
          year: combined.year,
          major: combined.major,
          instagram: combined.instagram,
          howHeard: combined.howHeard,
          metVia: combined.metVia,
          prayerRequest: combined.prayerRequest,
          tags: combined.tags,
          founders: combined.founders,
          carers: combined.carers,
          coCreators: combined.coCreators,
          visibleTo: combined.visibleTo,
          updatedAt: now,
          updatedBy: user?.uid,
          updatedByName,
        });

        // 2. Delete duplicate contact record
        const duplicateRef = doc(db, 'contacts', pair.duplicate.id);
        batch.delete(duplicateRef);

        // 3. Log activity audit
        logActivity({
          action: 'combined contact into',
          targetId: pair.survivor.id,
          targetName: pair.survivor.name,
          targetType: 'contact',
          type: 'edit',
          description: `Combined "${pair.duplicate.name}" (${pair.duplicate.id}) into "${pair.survivor.name}" (${pair.survivor.id}). Reason: ${pair.reason}`,
        });
      }

      await batch.commit();
      onApplied?.();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-2xl bg-surface-container-high rounded-xl shadow-2xl overflow-hidden border border-outline-variant max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-outline-variant flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-on-surface flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />{' '}
              {t('modals.combine_contacts', 'Combine contacts')}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {t('modals.combine_contacts_subtitle', 'Review candidate duplicate contacts before combining.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
            aria-label={t('modals.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {pairs.length === 0 ? (
            <div className="py-10 text-center">
              <Check className="w-10 h-10 text-primary mx-auto mb-3" />
              <p className="font-medium text-on-surface">
                {t('modals.no_duplicate_contacts', 'No duplicate contacts found')}
              </p>
              <p className="text-sm text-on-surface-variant mt-1">
                {t(
                  'modals.no_duplicate_contacts_sub',
                  'Contacts with matching email, phone, or name will appear here for dry-run review.'
                )}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-on-surface-variant mb-4">
                {t(
                  'modals.duplicate_pairs_found',
                  `Found ${pairs.length} candidate duplicate ${pairs.length === 1 ? 'pair' : 'pairs'}. The survivor record is kept and enriched; the duplicate is combined and removed.`
                )}
              </p>

              <div className="space-y-4">
                {pairs.map((pair, idx) => (
                  <div
                    key={`${pair.survivor.id}-${pair.duplicate.id}`}
                    className="rounded-lg border border-outline-variant/60 bg-surface p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-accent">
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {pair.reason}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDismissPair(idx)}
                        className="text-on-surface-variant/70 hover:text-error transition-colors p-1"
                        aria-label={t('modals.dismiss_pair', 'Dismiss pair')}
                        title={t('modals.dismiss_pair', 'Dismiss pair')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      {/* Survivor Box */}
                      <div className="p-3 rounded-md border border-primary/40 bg-primary/5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-primary uppercase">
                            {t('modals.survivor', 'Survivor (Kept)')}
                          </span>
                        </div>
                        <p className="font-medium text-on-surface mt-1">{pair.survivor.name}</p>
                        <p className="text-xs text-on-surface-variant">
                          {pair.survivor.email || pair.survivor.phone || 'No contact info'}
                        </p>
                        {pair.survivor.createdAt && (
                          <p className="text-[11px] text-on-surface-variant/70 mt-1">
                            {t('modals.created', 'Created')}: {pair.survivor.createdAt.slice(0, 10)}
                          </p>
                        )}
                      </div>

                      {/* Duplicate Box */}
                      <div className="p-3 rounded-md border border-outline-variant bg-surface-variant/40">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-on-surface-variant uppercase">
                            {t('modals.duplicate', 'Duplicate (Absorbed)')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSwapSurvivor(idx)}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            aria-label={t('modals.swap_survivor', 'Swap survivor')}
                          >
                            <ArrowRightLeft className="w-3 h-3" />
                            {t('modals.swap', 'Swap')}
                          </button>
                        </div>
                        <p className="font-medium text-on-surface mt-1">{pair.duplicate.name}</p>
                        <p className="text-xs text-on-surface-variant">
                          {pair.duplicate.email || pair.duplicate.phone || 'No contact info'}
                        </p>
                        {pair.duplicate.createdAt && (
                          <p className="text-[11px] text-on-surface-variant/70 mt-1">
                            {t('modals.created', 'Created')}: {pair.duplicate.createdAt.slice(0, 10)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-outline-variant flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-full font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            {t('modals.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={pairs.length === 0 || applying}
            onClick={handleApply}
            className="flex-1 h-12 bg-primary text-on-primary rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applying
              ? t('modals.applying', 'Applying...')
              : pairs.length === 0
                ? t('modals.nothing_to_combine', 'Nothing to combine')
                : t(
                    'modals.combine_n_contacts',
                    `Combine ${pairs.length} ${pairs.length === 1 ? 'contact' : 'contacts'}`
                  )}
          </button>
        </div>
      </div>
    </div>
  );
}
