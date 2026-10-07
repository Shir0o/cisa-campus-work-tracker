import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Check, Loader2, Undo2, Users } from 'lucide-react';
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

/** A permanent combine record (ADR 0038), as stored by the server. */
interface CombineRecord {
  id: string;
  keptId: string;
  combinedInId: string;
  reason?: string;
  status: 'pending' | 'done' | 'undone';
  combinedByName?: string;
  combinedAt?: string;
  undoneByName?: string;
  undoneAt?: string;
  keptBefore?: { name?: string };
  combinedInBefore?: { name?: string };
}

/** The three lists the undo preview returns (issue #1429). */
interface UndoPreviewItem {
  kind: string;
  id: string;
  label: string;
}

interface UndoPreview {
  goesBack: UndoPreviewItem[];
  stays: UndoPreviewItem[];
  notRestored: { kind: string; label: string }[];
}

const formatWhen = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

/** Fills {placeholders} in a translated string. */
const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');

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
  const [tab, setTab] = useState<'queue' | 'recent'>('queue');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [combiningId, setCombiningId] = useState<string | null>(null);
  const [combineError, setCombineError] = useState<string | null>(null);
  const [records, setRecords] = useState<CombineRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [previewRecordId, setPreviewRecordId] = useState<string | null>(null);
  const [preview, setPreview] = useState<UndoPreview | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

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

  useEffect(() => {
    if (tab !== 'recent') return;
    const q = query(collection(db, 'combineRecords'), orderBy('combinedAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        setRecords(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as CombineRecord[]);
        setRecordsLoading(false);
      },
      (e) => {
        setRecordsLoading(false);
        handleFirestoreError(e, OperationType.LIST, 'combineRecords');
      },
    );
  }, [tab]);

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

  const undo = async (recordId: string, dryRun: boolean) => {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/combine-contacts/undo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ combineRecordId: recordId, dryRun }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'Undo failed');
    }
    return body as { success: boolean; preview?: UndoPreview };
  };

  const loadPreview = async (recordId: string) => {
    if (previewingId || undoingId) return;
    setPreviewingId(recordId);
    setCombineError(null);
    setPreview(null);
    try {
      const body = await undo(recordId, true);
      setPreview(body.preview ?? { goesBack: [], stays: [], notRestored: [] });
      setPreviewRecordId(recordId);
    } catch (e) {
      setCombineError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewingId(null);
    }
  };

  const confirmUndo = async (recordId: string) => {
    if (undoingId) return;
    setUndoingId(recordId);
    setCombineError(null);
    try {
      await undo(recordId, false);
      setPreviewRecordId(null);
      setPreview(null);
    } catch (e) {
      setCombineError(e instanceof Error ? e.message : String(e));
    } finally {
      setUndoingId(null);
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

      <div
        role="tablist"
        aria-label={t('combine_contacts.tabs', 'Combine contacts sections')}
        className="flex gap-1 border-b border-outline-variant mb-6"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'queue'}
          onClick={() => setTab('queue')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'queue'
              ? 'text-primary border-primary'
              : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          {t('combine_contacts.tab_queue', 'Queue')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'recent'}
          onClick={() => setTab('recent')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'recent'
              ? 'text-primary border-primary'
              : 'text-on-surface-variant border-transparent hover:text-on-surface'
          }`}
        >
          {t('combine_contacts.tab_recent', 'Recent combines')}
        </button>
      </div>

      {combineError && (
        <p className="mb-4 rounded-lg border border-outline-variant bg-surface-variant/40 px-4 py-3 text-sm text-on-surface">
          {combineError}
        </p>
      )}

      {tab === 'recent' ? (
        recordsLoading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-medium text-on-surface">
              {t('combine_contacts.no_records', 'No combines yet')}
            </p>
            <p className="text-sm text-on-surface-variant mt-1">
              {t(
                'combine_contacts.no_records_sub',
                'Combines you make will be listed here so they can be undone.',
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((record) => {
              const keptName = record.keptBefore?.name || record.keptId;
              const combinedInName = record.combinedInBefore?.name || record.combinedInId;
              const isUndoing = undoingId === record.id;
              return (
                <section
                  key={record.id}
                  data-testid="combine-record"
                  className="rounded-xl border border-outline-variant bg-surface p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-on-surface">
                        {fill(t('combine_contacts.record_pair', '{combined} into {kept}'), {
                          combined: combinedInName,
                          kept: keptName,
                        })}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent mt-1">
                        {record.reason || t('combine_contacts.picked', 'Picked from the directory')}
                      </p>
                      <p className="text-sm text-on-surface-variant mt-1">
                        {fill(t('combine_contacts.combined_by', 'Combined by {name} on {date}'), {
                          name: record.combinedByName || '',
                          date: formatWhen(record.combinedAt),
                        })}
                      </p>
                      {record.status === 'undone' && (
                        <p className="text-sm text-on-surface-variant mt-1">
                          {fill(t('combine_contacts.undone_by', 'Undone by {name} on {date}'), {
                            name: record.undoneByName || '',
                            date: formatWhen(record.undoneAt),
                          })}
                        </p>
                      )}
                    </div>
                    {record.status !== 'undone' && (
                      <button
                        type="button"
                        disabled={undoingId !== null || previewingId !== null}
                        onClick={() => loadPreview(record.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-on-surface font-medium text-sm hover:bg-surface-variant/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {previewingId === record.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Undo2 className="w-4 h-4" />
                        )}
                        {t('combine_contacts.undo', 'Undo combine')}
                      </button>
                    )}
                  </div>

                  {previewRecordId === record.id && preview && (
                    <div
                      data-testid="undo-preview"
                      className="mt-4 border-t border-outline-variant/40 pt-4"
                    >
                      <div className="grid gap-4 sm:grid-cols-3 text-sm">
                        <div>
                          <p className="font-medium text-on-surface">
                            {t('combine_contacts.undo_goes_back', 'Goes back')}
                          </p>
                          <ul className="mt-1 space-y-0.5 text-on-surface-variant">
                            {preview.goesBack.map((item, index) => (
                              <li key={`${item.kind}-${item.id}-${index}`}>{item.label}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-on-surface">
                            {t('combine_contacts.undo_stays', 'Stays')}
                          </p>
                          <ul className="mt-1 space-y-0.5 text-on-surface-variant">
                            {preview.stays.map((item, index) => (
                              <li key={`${item.kind}-${item.id}-${index}`}>{item.label}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-medium text-on-surface">
                            {t('combine_contacts.undo_not_restored', 'Not restored')}
                          </p>
                          <ul className="mt-1 space-y-0.5 text-on-surface-variant">
                            {preview.notRestored.map((item, index) => (
                              <li key={`${item.kind}-${item.label}-${index}`}>{item.label}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <button
                          type="button"
                          disabled={undoingId !== null}
                          onClick={() => {
                            setPreviewRecordId(null);
                            setPreview(null);
                          }}
                          className="px-3 py-1.5 rounded-full border border-outline-variant text-on-surface font-medium text-sm hover:bg-surface-variant/60 transition-colors disabled:opacity-40"
                        >
                          {t('combine_contacts.undo_cancel', 'Cancel')}
                        </button>
                        <button
                          type="button"
                          disabled={undoingId !== null}
                          onClick={() => confirmUndo(record.id)}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isUndoing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Undo2 className="w-4 h-4" />
                          )}
                          {t('combine_contacts.undo_confirm', 'Confirm undo')}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : loading ? (
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
