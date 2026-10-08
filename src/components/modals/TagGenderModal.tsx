import React, { useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { Check } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { planGenderTagging } from '../../lib/gender';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { PopupFrame } from '../ui/PopupFrame';
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
    <PopupFrame
      open
      onClose={onClose}
      size="md"
      eyebrow={t('directory.tag_gender', 'Tag M/F')}
      title={t('modals.tag_gender') || 'Tag M / F'}
      subtitle={t('modals.dry_run_preview')}
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      primary={{
        label:
          changes.length === 0
            ? t('modals.nothing_to_tag') || 'Nothing to tag'
            : (t('modals.tag_n_contacts') || 'Tag {n} {count}')
                .replace('{n}', String(changes.length))
                .replace(
                  '{count}',
                  changes.length === 1
                    ? t('modals.contact_singular') || 'contact'
                    : t('modals.contacts'),
                ),
        onClick: handleApply,
        disabled: changes.length === 0,
        saving: applying,
        savingLabel: t('modals.applying'),
      }}
    >
      <div className="px-7 py-5">
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
                      {row.gender === 'M' ? t('common.male', 'Male') : t('common.female', 'Female')}
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
    </PopupFrame>
  );
}
