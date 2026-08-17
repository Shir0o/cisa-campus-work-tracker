import React, { useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { X, Check, Combine } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { planTagCombining } from '../../lib/tags';
import { useAuth } from '../AuthProvider';
import type { Contact } from '../../types';

interface CombineTagsModalProps {
  contacts: Contact[];
  onClose: () => void;
  onApplied?: () => void;
}

/**
 * Dry-run tag combining for the directory.
 *
 * The modal computes a preview of every contact whose tags would change
 * (duplicate season variants, club-rush spellings, etc.) and only writes to
 * Firestore after the user confirms the preview.
 */
export default function CombineTagsModal({
  contacts,
  onClose,
  onApplied,
}: CombineTagsModalProps) {
  const { user } = useAuth();
  const [applying, setApplying] = useState(false);

  const changes = useMemo(
    () => planTagCombining(contacts),
    [contacts],
  );

  const handleApply = async () => {
    if (changes.length === 0 || applying) return;
    setApplying(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      changes.forEach((row) => {
        batch.update(doc(db, 'contacts', row.contactId), {
          tags: row.to,
          updatedAt: now,
          updatedBy: user?.uid,
          updatedByName: user?.displayName || user?.email?.split('@')[0] || 'Unknown User',
        });

        logActivity({
          action: `combined tags on`,
          targetId: row.contactId,
          targetName: row.name,
          targetType: 'contact',
          type: 'edit',
          description: `Tags: [${row.from.join(', ')}] → [${row.to.join(', ')}]`,
        });
      });

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-2xl bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden border border-outline-variant max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-outline-variant flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-on-surface flex items-center gap-2">
              <Combine className="w-5 h-5 text-primary" /> Combine tags
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              Dry-run preview — no changes are saved until you confirm.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {changes.length === 0 ? (
            <div className="py-10 text-center">
              <Check className="w-10 h-10 text-primary mx-auto mb-3" />
              <p className="font-medium text-on-surface">No duplicate or overlapping tags found.</p>
              <p className="text-sm text-on-surface-variant mt-1">
                Season variants like “Fall '26” and “Fall 2026” would be combined here.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-on-surface-variant mb-4">
                {changes.length} {changes.length === 1 ? 'contact' : 'contacts'} would have their tags combined.
              </p>
              <div className="space-y-3">
                {changes.slice(0, 100).map((row) => (
                  <div
                    key={row.contactId}
                    className="rounded-2xl border border-outline-variant/60 bg-surface p-4"
                  >
                    <p className="font-medium text-on-surface">{row.name}</p>
                    <p className="text-sm text-on-surface-variant mt-1">
                      <span className="text-on-surface-variant/70">Before:</span>{' '}
                      {row.from.length > 0 ? row.from.join(', ') : '—'}
                    </p>
                    <p className="text-sm text-on-surface-variant mt-0.5">
                      <span className="text-on-surface-variant/70">After:</span>{' '}
                      {row.to.length > 0 ? row.to.join(', ') : '—'}
                    </p>
                  </div>
                ))}
              </div>
              {changes.length > 100 && (
                <p className="text-sm text-on-surface-variant mt-4">
                  …and {changes.length - 100} more.
                </p>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-outline-variant flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-full font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={changes.length === 0 || applying}
            onClick={handleApply}
            className="flex-1 h-12 bg-primary text-on-primary rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applying
              ? 'Applying…'
              : changes.length === 0
                ? 'Nothing to combine'
                : `Combine ${changes.length} ${changes.length === 1 ? 'contact' : 'contacts'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
