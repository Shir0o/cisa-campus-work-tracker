import React, { useMemo, useState } from 'react';
import {
  doc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { X, Check, Users, ArrowRightLeft, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import {
  findCandidateDuplicates,
  combineContactProfiles,
  buildCombineOps,
  chunkOps,
  type DuplicatePair,
  type CombineMigrationData,
} from '../../lib/contactCombining';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { parseMs } from '../landing/helpers';
import type { Contact } from '../../types';

// Normalize createdAt (ISO string, Firestore Timestamp, or numeric ms) to
// yyyy-mm-dd for the "Created" labels (issue #1130).
const createdAtLabel = (createdAt?: string): string | null => {
  const ms = parseMs(createdAt);
  return ms == null ? null : new Date(ms).toISOString().slice(0, 10);
};

interface CombineContactsModalProps {
  contacts: Contact[];
  onClose: () => void;
  onApplied?: () => void;
}

/**
 * Combine contacts for the directory (Issue #1070 / ADR 0026).
 *
 * Scans contacts for candidate duplicates (matching email, phone, or name)
 * and presents a preview of each pair. Full-timers can confirm pairs one by
 * one (inline "Combine"), skip false positives ("Skip for now"), or combine
 * everything at once ("Combine all"). Combining migrates the absorbed
 * contact's subcollections (interactions, threads), re-parents external
 * references (prayers, tasks, visits), enriches the survivor, and deletes the
 * duplicate — all in chunked batches that respect the Firestore write limit.
 */
export default function CombineContactsModal({
  contacts,
  onClose,
  onApplied,
}: CombineContactsModalProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [applying, setApplying] = useState(false);
  const [combiningId, setCombiningId] = useState<string | null>(null);

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

  const handleSkipPair = (index: number) => {
    setPairs((prev) => prev.filter((_, i) => i !== index));
  };

  /** Reads the subcollections and external references that point at the duplicate. */
  const loadMigrationData = async (duplicateId: string): Promise<CombineMigrationData> => {
    const [interactions, threads, prayers, tasks, visits] = await Promise.all([
      getDocs(collection(db, 'contacts', duplicateId, 'interactions')),
      getDocs(collection(db, 'contacts', duplicateId, 'threads')),
      getDocs(query(collection(db, 'prayers'), where('contactId', '==', duplicateId))),
      getDocs(query(collection(db, 'tasks'), where('contactId', '==', duplicateId))),
      getDocs(query(collection(db, 'visits'), where('contactIds', 'array-contains', duplicateId))),
    ]);

    return {
      interactions: interactions.docs.map((d) => ({ id: d.id, data: d.data() })),
      threads: threads.docs.map((d) => ({ id: d.id, data: d.data() })),
      prayers: prayers.docs.map((d) => d.id),
      tasks: tasks.docs.map((d) => d.id),
      visits: visits.docs.map((d) => ({ id: d.id, contactIds: d.data().contactIds ?? [] })),
    };
  };

  /** Combines a single pair: migrate subcollections/references, enrich survivor, delete duplicate. */
  const combinePair = async (pair: DuplicatePair): Promise<void> => {
    const combined = combineContactProfiles(pair.survivor, pair.duplicate);
    const now = new Date().toISOString();
    const updatedByName =
      user?.displayName || user?.email?.split('@')[0] || t('modals.unknown_user', 'Unknown User');

    const migration = await loadMigrationData(pair.duplicate.id);
    const ops = buildCombineOps(
      pair.survivor,
      pair.duplicate,
      combined,
      now,
      user?.uid,
      updatedByName,
      migration
    );

    for (const chunk of chunkOps(ops)) {
      const batch = writeBatch(db);
      for (const op of chunk) {
        const ref = doc(db, op.collection, op.docId);
        if (op.op === 'update') batch.update(ref, op.data);
        else if (op.op === 'set') batch.set(ref, op.data);
        else batch.delete(ref);
      }
      await batch.commit();
    }

    // Audit each combined pair (ADR 0026).
    logActivity({
      action: 'combined contact into',
      targetId: pair.survivor.id,
      targetName: pair.survivor.name,
      targetType: 'contact',
      type: 'edit',
      description: `Combined "${pair.duplicate.name}" (${pair.duplicate.id}) into "${pair.survivor.name}" (${pair.survivor.id}). Reason: ${pair.reason}`,
    });
  };

  /** Combine a single pair from its card, removing it from the preview immediately. */
  const handleCombinePair = async (index: number) => {
    const pair = pairs[index];
    if (!pair || combiningId) return;
    setCombiningId(`${pair.survivor.id}-${pair.duplicate.id}`);

    try {
      await combinePair(pair);
      setPairs((prev) => prev.filter((_, i) => i !== index));
      onApplied?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    } finally {
      setCombiningId(null);
    }
  };

  const handleApplyAll = async () => {
    if (pairs.length === 0 || applying) return;
    setApplying(true);

    try {
      for (const pair of pairs) {
        await combinePair(pair);
      }
      onApplied?.();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    } finally {
      setApplying(false);
    }
  };

  const activeCombiningId = (pair: DuplicatePair) => `${pair.survivor.id}-${pair.duplicate.id}`;

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
                {pairs.map((pair, idx) => {
                  const isCombining = combiningId === activeCombiningId(pair);
                  return (
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
                          onClick={() => handleSkipPair(idx)}
                          disabled={combiningId !== null}
                          className="text-on-surface-variant/70 hover:text-on-surface-variant transition-colors p-1"
                          aria-label={t('modals.skip_for_now', 'Skip for now')}
                          title={t('modals.skip_for_now', 'Skip for now')}
                        >
                          <EyeOff className="w-4 h-4" />
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
                              {t('modals.created', 'Created')}: {createdAtLabel(pair.survivor.createdAt)}
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
                              disabled={combiningId !== null}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40"
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
                              {t('modals.created', 'Created')}: {createdAtLabel(pair.duplicate.createdAt)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Inline combine */}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={combiningId !== null}
                          onClick={() => handleCombinePair(idx)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isCombining ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {t('modals.applying', 'Applying…')}
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              {t('modals.combine', 'Combine')}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
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
            disabled={pairs.length === 0 || applying || combiningId !== null}
            onClick={handleApplyAll}
            className="flex-1 h-12 bg-primary text-on-primary rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applying
              ? t('modals.applying', 'Applying…')
              : pairs.length === 0
                ? t('modals.nothing_to_combine', 'Nothing to combine')
                : t('modals.combine_all')
                    .replace('{n}', String(pairs.length))
                    .replace('{count}', pairs.length === 1 ? t('modals.contact_singular', 'contact') : t('modals.contacts', 'contacts'))}
          </button>
        </div>
      </div>
    </div>
  );
}