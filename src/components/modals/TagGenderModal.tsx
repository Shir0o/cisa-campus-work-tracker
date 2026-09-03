import React, { useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { X, Check, Tag } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { planGenderTagging } from '../../lib/gender';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import type { Contact } from '../../types';

interface TagGenderModalProps {
  contacts: Contact[];
  onClose: () => void;
  onApplied?: () => void;
}

/**
 * Dry-run gender tagging modal for the directory.
 *
 * Computes a preview of every contact whose tags would receive an M or F tag
 * (derived from existing gender or inferred from first name) and writes to
 * Firestore after user confirmation.
 */
export default function TagGenderModal({
  contacts,
  onClose,
  onApplied,
}: TagGenderModalProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [applying, setApplying] = useState(false);

  const changes = useMemo(
    () => planGenderTagging(contacts),
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
          gender: row.gender,
          updatedAt: now,
          updatedBy: user?.uid,
          updatedByName: user?.displayName || user?.email?.split('@')[0] || t('modals.unknown_user'),
        });

        logActivity({
          action: `tagged gender on`,
          targetId: row.contactId,
          targetName: row.name,
          targetType: 'contact',
          type: 'edit',
          description: `Gender: ${row.gender}, Tags: [${row.from.join(', ')}] → [${row.to.join(', ')}]`,
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-2xl bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden border border-outline-variant max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-outline-variant flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-on-surface flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" /> {t('modals.tag_gender') || 'Tag M / F'}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {t('modals.dry_run_preview')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
            aria-label={t('modals.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {changes.length === 0 ? (
            <div className="py-10 text-center">
              <Check className="w-10 h-10 text-primary mx-auto mb-3" />
              <p className="font-medium text-on-surface">
                {t('modals.no_contacts_to_tag') || 'All contacts already have M/F tags.'}
              </p>
              <p className="text-sm text-on-surface-variant mt-1">
                {t('modals.all_gender_tagged') || 'Every contact with a known or inferrable gender is tagged with M or F.'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-on-surface-variant mb-4">
                {(t('modals.gender_contacts_would_change') || '{n} {count} would have M/F tags added.')
                  .replace('{n}', String(changes.length))
                  .replace('{count}', changes.length === 1 ? t('modals.contact_singular') || 'contact' : t('modals.contacts'))}
              </p>
              <div className="space-y-3">
                {changes.slice(0, 100).map((row) => (
                  <div
                    key={row.contactId}
                    className="rounded-2xl border border-outline-variant/60 bg-surface p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-on-surface">{row.name}</p>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {row.gender === 'M' ? (t('common.brother') || 'Brother (M)') : (t('common.sister') || 'Sister (F)')}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant mt-1">
                      <span className="text-on-surface-variant/70">{t('modals.before')}</span>{' '}
                      {row.from.length > 0 ? row.from.join(', ') : '—'}
                    </p>
                    <p className="text-sm text-on-surface-variant mt-0.5">
                      <span className="text-on-surface-variant/70">{t('modals.after')}</span>{' '}
                      {row.to.length > 0 ? row.to.join(', ') : '—'}
                    </p>
                  </div>
                ))}
              </div>
              {changes.length > 100 && (
                <p className="text-sm text-on-surface-variant mt-4">
                  {t('modals.and_more').replace('{n}', String(changes.length - 100))}
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
            {t('modals.cancel')}
          </button>
          <button
            type="button"
            disabled={changes.length === 0 || applying}
            onClick={handleApply}
            className="flex-1 h-12 bg-primary text-on-primary rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applying
              ? t('modals.applying')
              : changes.length === 0
                ? (t('modals.nothing_to_tag') || 'Nothing to tag')
                : (t('modals.tag_n_contacts') || 'Tag {n} {count}')
                    .replace('{n}', String(changes.length))
                    .replace('{count}', changes.length === 1 ? t('modals.contact_singular') || 'contact' : t('modals.contacts'))}
          </button>
        </div>
      </div>
    </div>
  );
}
