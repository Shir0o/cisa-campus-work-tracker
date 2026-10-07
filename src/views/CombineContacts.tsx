import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Check, Loader2, Users } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useLanguage } from '../components/LanguageProvider';
import PageContainer from '../components/layout/PageContainer';
import { Skeleton } from '../components/ui/Skeleton';
import {
  findCombineCandidates,
  mergeContactProfiles,
  diffCombineFields,
  type CombineFieldRow,
  type CombinePair,
} from '../lib/combineContactsPlan';
import type { Contact } from '../types';

/** Display label per reviewed field, used as the i18n fallback. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  location: 'Location',
  email: 'Email',
  phone: 'Phone',
  stage: 'Stage',
  spiritualBackground: 'Spiritual background',
  pronouns: 'Pronouns',
  gender: 'Gender',
  year: 'Year',
  major: 'Major',
  instagram: 'Instagram',
  howHeard: 'How they heard',
  metVia: 'How we met',
  prayerRequest: 'Prayer request',
  notes: 'Notes',
  tags: 'Tags',
  founders: 'Founders',
  carers: 'Cared for by',
  coCreators: 'Co-creators',
  visibleTo: 'Visible to',
};

/** Human label per decision kind, used as the i18n fallback. */
const KIND_LABELS: Record<CombineFieldRow['kind'], string> = {
  same: 'Same',
  kept: 'Kept',
  'filled-in': 'Filled in',
  merged: 'Merged',
  'notes-combined': 'Notes combined',
};

const pairKey = (pair: CombinePair) => `${pair.kept.id}-${pair.combinedIn.id}`;

const renderValue = (value: string | string[]): string => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '';
  return value;
};

/**
 * Combine contacts (issue #1427, ADR 0038). A Full-timer review page reached
 * from the directory: the Queue of detected pairs (same email, phone or name),
 * each shown as a read-only kept | combined-in | result diff. Combine calls
 * the Full-timer-only server endpoint, which performs the merge and writes the
 * combine record. There is no Combine all.
 */
export default function CombineContacts() {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [combiningId, setCombiningId] = useState<string | null>(null);
  const [combineError, setCombineError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        setContacts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
        setLoading(false);
      },
      (e) => {
        setError(true);
        setLoading(false);
        handleFirestoreError(e, OperationType.LIST, 'contacts');
      },
    );
  }, []);

  const pairs = useMemo(
    () => findCombineCandidates(contacts).filter((p) => !skipped.has(pairKey(p))),
    [contacts, skipped],
  );

  const combine = async (pair: CombinePair) => {
    if (combiningId) return;
    setCombiningId(pairKey(pair));
    setCombineError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/combine-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ keptId: pair.kept.id, combinedInId: pair.combinedIn.id, reason: pair.reason }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Combine failed');
      }
    } catch (e) {
      setCombineError(e instanceof Error ? e.message : String(e));
    } finally {
      setCombiningId(null);
    }
  };

  return (
    <PageContainer>
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-3xl text-on-surface flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            {t('combine_contacts.title', 'Combine contacts')}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {t('combine_contacts.subtitle', 'Review detected duplicate contacts before combining.')}
          </p>
        </div>
      </header>

      <div role="tablist" aria-label={t('combine_contacts.tabs', 'Combine contacts sections')} className="flex gap-1 border-b border-outline-variant mb-6">
        <button
          type="button"
          role="tab"
          aria-selected="true"
          className="px-4 py-2 text-sm font-medium text-primary border-b-2 border-primary"
        >
          {t('combine_contacts.tab_queue', 'Queue')}
        </button>
      </div>

      {combineError && (
        <p className="mb-4 rounded-lg border border-outline-variant bg-surface-variant/40 px-4 py-3 text-sm text-on-surface">
          {combineError}
        </p>
      )}

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? null : pairs.length === 0 ? (
        <div className="py-16 text-center">
          <Check className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="font-medium text-on-surface">
            {t('combine_contacts.none', 'No duplicate contacts found')}
          </p>
          <p className="text-sm text-on-surface-variant mt-1">
            {t(
              'combine_contacts.none_sub',
              'Contacts with matching email, phone, or name will appear here for review.',
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pairs.map((pair) => {
            const merged = mergeContactProfiles(pair.kept, pair.combinedIn);
            const rows = diffCombineFields(pair.kept, pair.combinedIn, merged);
            const key = pairKey(pair);
            const isCombining = combiningId === key;
            return (
              <section
                key={key}
                data-testid="combine-pair"
                className="rounded-xl border border-outline-variant bg-surface p-5"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                    {pair.reason}
                  </span>
                  <button
                    type="button"
                    disabled={combiningId !== null}
                    onClick={() => setSkipped((prev) => new Set(prev).add(key))}
                    className="text-sm text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
                  >
                    {t('combine_contacts.skip', 'Skip for now')}
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wider text-on-surface-variant text-left">
                        <th className="py-2 pr-4 font-medium">{t('combine_contacts.field', 'Field')}</th>
                        <th className="py-2 pr-4 font-medium">{t('combine_contacts.kept', 'Kept contact')}</th>
                        <th className="py-2 pr-4 font-medium">{t('combine_contacts.combined_in', 'Combined-in contact')}</th>
                        <th className="py-2 pr-4 font-medium">{t('combine_contacts.result', 'Result')}</th>
                        <th className="py-2 font-medium">{t('combine_contacts.decision', 'Decision')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.field} className="border-t border-outline-variant/40">
                          <td className="py-2 pr-4 font-medium text-on-surface">
                            {t('fields.' + row.field, FIELD_LABELS[row.field] ?? row.field)}
                          </td>
                          <td className="py-2 pr-4 text-on-surface-variant">{renderValue(row.kept)}</td>
                          <td className="py-2 pr-4 text-on-surface-variant">{renderValue(row.combinedIn)}</td>
                          <td className="py-2 pr-4 text-on-surface">{renderValue(row.result)}</td>
                          <td className="py-2 text-on-surface-variant">
                            {t('combine_contacts.kind_' + row.kind, KIND_LABELS[row.kind])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end mt-4">
                  <button
                    type="button"
                    disabled={combiningId !== null}
                    onClick={() => combine(pair)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isCombining ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('combine_contacts.combining', 'Combining…')}
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        {t('combine_contacts.combine', 'Combine')}
                      </>
                    )}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
