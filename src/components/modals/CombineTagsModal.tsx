import React, { useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { X, Check, Combine } from 'lucide-react';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { clusterTags, planTagCombiningWithRules } from '../../lib/tags';
import { cn } from '../../lib/utils';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import type { Contact } from '../../types';

interface CombineTagsModalProps {
  contacts: Contact[];
  onClose: () => void;
  onApplied?: () => void;
}

/**
 * Dry-run tag combining for the directory.
 *
 * Discovers tag variation clusters across the contacts directory, groups them
 * into reviewable rules with individual checkboxes, and builds a preview of
 * affected contacts. Writes to Firestore only after the user confirms.
 */
export default function CombineTagsModal({
  contacts,
  onClose,
  onApplied,
}: CombineTagsModalProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [applying, setApplying] = useState(false);

  const rules = useMemo(
    () => clusterTags(contacts),
    [contacts],
  );

  const [disabledRuleIds, setDisabledRuleIds] = useState<Set<string>>(() => new Set());

  const enabledRuleIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rules) {
      if (!disabledRuleIds.has(r.id)) {
        set.add(r.id);
      }
    }
    return set;
  }, [rules, disabledRuleIds]);

  const toggleRule = (ruleId: string) => {
    setDisabledRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  const selectAll = () => setDisabledRuleIds(new Set());
  const deselectAll = () => setDisabledRuleIds(new Set(rules.map((r) => r.id)));

  const changes = useMemo(
    () => planTagCombiningWithRules(contacts, rules, enabledRuleIds),
    [contacts, rules, enabledRuleIds],
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
          updatedByName: user?.displayName || user?.email?.split('@')[0] || t('modals.unknown_user'),
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
              <Combine className="w-5 h-5 text-primary" /> {t('modals.combine_tags')}
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

        <div className="p-6 overflow-y-auto space-y-6">
          {rules.length === 0 ? (
            <div className="py-10 text-center">
              <Check className="w-10 h-10 text-primary mx-auto mb-3" />
              <p className="font-medium text-on-surface">{t('modals.no_duplicate_tags')}</p>
              <p className="text-sm text-on-surface-variant mt-1">
                {t('modals.season_variants')}
              </p>
            </div>
          ) : (
            <>
              {/* Rules section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-on-surface">
                    {t('modals.rules_to_combine', 'Proposed tag rules ({count})').replace('{count}', String(rules.length))}
                  </h3>
                  <div className="flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-primary hover:underline font-medium"
                    >
                      {t('modals.select_all_rules', 'Select all')}
                    </button>
                    <span className="text-outline-variant">·</span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-on-surface-variant hover:underline font-medium"
                    >
                      {t('modals.deselect_all_rules', 'Deselect all')}
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  {rules.map((rule) => {
                    const isChecked = enabledRuleIds.has(rule.id);
                    return (
                      <label
                        key={rule.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-2xl border transition-colors cursor-pointer select-none',
                          isChecked
                            ? 'bg-surface border-primary/40 shadow-sm'
                            : 'bg-surface-variant/40 border-outline-variant/40 opacity-70',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRule(rule.id)}
                          className="mt-1 h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/30"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-on-surface-variant line-through opacity-80">
                              {rule.from.join(', ')}
                            </span>
                            <span className="text-xs text-primary font-bold">→</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                              {rule.to}
                            </span>
                          </div>
                          <p className="text-xs text-on-surface-variant/80 mt-1">
                            {t('modals.rule_contacts_count', '{n} {count}')
                              .replace('{n}', String(rule.contactCount))
                              .replace(
                                '{count}',
                                rule.contactCount === 1 ? t('modals.contact_singular') : t('modals.contacts'),
                              )}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Contacts preview */}
              <div>
                <h3 className="text-sm font-semibold text-on-surface mb-3">
                  {t('modals.contacts_would_change')
                    .replace('{n}', String(changes.length))
                    .replace('{count}', changes.length === 1 ? t('modals.contact_singular') : t('modals.contacts'))}
                </h3>
                {changes.length === 0 ? (
                  <p className="text-xs text-on-surface-variant italic">
                    {t('modals.nothing_to_combine')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {changes.slice(0, 100).map((row) => (
                      <div
                        key={row.contactId}
                        className="rounded-2xl border border-outline-variant/60 bg-surface p-4"
                      >
                        <p className="font-medium text-on-surface">{row.name}</p>
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
                    {changes.length > 100 && (
                      <p className="text-sm text-on-surface-variant mt-4">
                        {t('modals.and_more').replace('{n}', String(changes.length - 100))}
                      </p>
                    )}
                  </div>
                )}
              </div>
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
                ? t('modals.nothing_to_combine')
                : t('modals.combine_n_contacts').replace('{n}', String(changes.length)).replace('{count}', changes.length === 1 ? t('modals.contact_singular') : t('modals.contacts'))}
          </button>
        </div>
      </div>
    </div>
  );
}
