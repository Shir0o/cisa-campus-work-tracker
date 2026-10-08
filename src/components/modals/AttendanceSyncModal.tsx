import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../LanguageProvider';
import { PopupFrame } from '../ui/PopupFrame';
import type { Contact, Gathering, Rhythm } from '../../types';
import type { AttendancePreview, PendingAttendanceImport } from '../../lib/sync/attdCorrelator';
import { confirmAttendanceImport, discardPendingAttendanceImport } from '../../lib/sync/attdSync';
import type { AttendanceImportDecision } from '../../lib/sync/attdSync';

export interface AttendanceSyncModalProps {
  isOpen: boolean;
  pendingImport: PendingAttendanceImport | null;
  contacts: Contact[];
  rhythms: Rhythm[];
  gatherings: Gathering[];
  onClose: () => void;
  onConfirmed?: () => void;
  userId?: string;
  userName?: string;
}

const markLabel = (value: 'present' | 'absent'): string => value;

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-container-low px-3 py-2">
      <div className={cn('font-serif text-xl leading-none', tone ?? 'text-on-surface')}>{value}</div>
      <div className="mt-1 text-[11px] font-medium text-on-surface-variant">{label}</div>
    </div>
  );
}

export default function AttendanceSyncModal(props: AttendanceSyncModalProps) {
  if (props.isOpen === false) return null;
  if (props.pendingImport === null) return null;
  return <AttendanceSyncModalBody key={props.pendingImport.id} {...props} pendingImport={props.pendingImport} />;
}

function AttendanceSyncModalBody({
  isOpen,
  pendingImport,
  contacts,
  rhythms,
  gatherings,
  onClose,
  onConfirmed,
  userId,
  userName,
}: AttendanceSyncModalProps) {
  const { t } = useLanguage();
  const [decisions, setDecisions] = useState<AttendanceImportDecision[]>(() => {
    if (pendingImport === null) return [];
    return pendingImport.preview.attendees.map((row, index) => ({
      rowIndex: index,
      memberId: row.memberId,
      attdName: row.attdName,
      status: row.status,
      isLate: row.isLate,
      contactId: row.contactId,
      contactName: row.contactName,
      keepCisa: false,
    }));
  });
  const [targetRhythmId, setTargetRhythmId] = useState(() => pendingImport?.preview.rhythmId ?? '');
  const [targetGatheringId, setTargetGatheringId] = useState<string | null>(() => pendingImport?.preview.gatheringId ?? null);
  const [createGathering, setCreateGathering] = useState(() => pendingImport?.preview.gatheringId === null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gatheringOptions = useMemo(
    () => gatherings.filter((entry) => entry.rhythmId === targetRhythmId),
    [gatherings, targetRhythmId],
  );

  const preview: AttendancePreview | null = pendingImport ? pendingImport.preview : null;

  const updateDecision = (index: number, patch: Partial<AttendanceImportDecision>) => {
    setDecisions((previous) => previous.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const changeRhythm = (nextId: string) => {
    setTargetRhythmId(nextId);
    let nextGatheringId: string | null = null;
    if (preview) {
      for (const entry of gatherings) {
        if (entry.rhythmId === nextId) {
          if (entry.date === preview.sessionDate) nextGatheringId = entry.id;
        }
      }
    }
    setTargetGatheringId(nextGatheringId);
    setCreateGathering(nextGatheringId === null);
  };

  const changeGathering = (nextId: string) => {
    if (nextId === '') {
      setTargetGatheringId(null);
      setCreateGathering(true);
      return;
    }
    setTargetGatheringId(nextId);
    setCreateGathering(false);
  };

  const acceptAllAttd = () => {
    setDecisions((previous) => previous.map((row) => ({ ...row, keepCisa: false })));
  };

  const handleDiscard = async () => {
    if (pendingImport === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await discardPendingAttendanceImport(pendingImport.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('attendanceSync.discard_failed', 'Could not discard this draft.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (pendingImport === null) return;
    if (targetRhythmId === '') {
      setError(t('attendanceSync.choose_rhythm_error', 'Choose a Rhythm before confirming.'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await confirmAttendanceImport({
        importId: pendingImport.id,
        preview: pendingImport.preview,
        decisions,
        contacts,
        rhythms,
        gatherings,
        targetRhythmId,
        targetGatheringId,
        createGathering,
        userId: userId ?? '',
        userName: userName ?? '',
      });
      if (onConfirmed) onConfirmed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('attendanceSync.confirm_failed', 'Could not confirm this sync.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (isOpen === false) return null;
  if (pendingImport === null) return null;
  if (preview === null) return null;

  return (
    <PopupFrame
      open={isOpen}
      onClose={onClose}
      size="lg"
      eyebrow={pendingImport.eventName}
      title={t('attendanceSync.modal_title', 'Review attendance sync')}
      subtitle={`${pendingImport.eventName} - ${preview.sessionDate}`}
      destructive={{ label: t('attendanceSync.discard', 'Discard draft'), onClick: () => void handleDiscard() }}
      cancelLabel={t('modals.cancel')}
      onCancel={onClose}
      primary={{
        label: t('attendanceSync.confirm', 'Confirm sync'),
        onClick: () => void handleConfirm(),
        disabled: submitting || targetRhythmId === '',
        saving: submitting,
        savingLabel: t('attendanceSync.saving', 'Confirming…'),
      }}
    >
          <div className="space-y-5 px-7 py-5">
            {error ? (
              <p role="alert" className="text-sm text-error">{error}</p>
            ) : null}
            <section className="grid gap-4 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest p-4 md:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-on-surface">{t('attendanceSync.rhythm', 'Rhythm')}</span>
                <select
                  aria-label={t('attendanceSync.rhythm', 'Rhythm')}
                  value={targetRhythmId}
                  onChange={(event) => changeRhythm(event.target.value)}
                  className="h-11 w-full rounded-xl border border-outline bg-surface px-3 text-sm text-on-surface"
                >
                  <option value="">{t('attendanceSync.choose_rhythm', 'Choose a Rhythm')}</option>
                  {rhythms.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-on-surface">{t('attendanceSync.gathering', 'Gathering')}</span>
                <select
                  aria-label={t('attendanceSync.gathering', 'Gathering')}
                  value={targetGatheringId ?? ''}
                  onChange={(event) => changeGathering(event.target.value)}
                  className="h-11 w-full rounded-xl border border-outline bg-surface px-3 text-sm text-on-surface"
                >
                  <option value="">
                    {t('attendanceSync.create_occasion', 'Create a new occasion on {date}').replace('{date}', preview.sessionDate)}
                  </option>
                  {gatheringOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name} - {entry.date}</option>
                  ))}
                </select>
              </label>
              <p className="md:col-span-2 text-xs text-on-surface-variant">
                {t('attendanceSync.target_hint', 'Confirming applies every attd mark to this Gathering and remembers the event and attendee mappings for next time.')}
              </p>
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={t('attendanceSync.stat_present', 'Present')} value={preview.stats.present} />
              <Stat label={t('attendanceSync.stat_late', 'Late')} value={preview.stats.late} />
              <Stat label={t('attendanceSync.stat_absent', 'Absent')} value={preview.stats.absent} />
              <Stat label={t('attendanceSync.stat_matched', 'Matched')} value={preview.stats.matched} />
              <Stat label={t('attendanceSync.stat_walk_ins', 'New walk-ins')} value={preview.stats.walkIns} />
              <Stat label={t('attendanceSync.stat_conflicts', 'Conflicts')} value={preview.stats.conflicts} tone="text-error" />
            </section>

            {preview.conflicts.length > 0 ? (
              <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-error/30 bg-error/5 px-4 py-3">
                <AlertTriangle className="h-5 w-5 text-error" />
                <p className="flex-1 text-sm text-on-surface">
                  {t('attendanceSync.conflict_banner', '{n} marks differ from what CISA already has.').replace('{n}', String(preview.conflicts.length))}
                </p>
                <button
                  type="button"
                  onClick={acceptAllAttd}
                  className="rounded-full border border-outline-variant bg-surface px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-high"
                >
                  {t('attendanceSync.accept_all', 'Accept all attd')}
                </button>
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-on-surface-variant" />
                <h3 className="font-serif text-lg text-on-surface">{t('attendanceSync.attendees_title', 'Attendees')}</h3>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-outline-variant/60">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-surface-container-high text-xs uppercase tracking-wide text-on-surface-variant">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t('attendanceSync.col_attd_name', 'attd name')}</th>
                      <th className="px-3 py-2 font-semibold">{t('attendanceSync.col_status', 'Status')}</th>
                      <th className="px-3 py-2 font-semibold">{t('attendanceSync.col_match', 'CISA match')}</th>
                      <th className="px-3 py-2 font-semibold">{t('attendanceSync.col_conflict', 'Conflict')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/40">
                    {decisions.map((row, index) => {
                      const conflict = preview.conflicts.find((entry) => entry.contactId === row.contactId) ?? null;
                      return (
                        <tr key={`${row.attdName}-${index}`} className="align-top">
                          <td className="px-3 py-3">
                            <div className="font-medium text-on-surface">{row.attdName}</div>
                            <div className="text-xs text-on-surface-variant">{row.memberId ?? t('attendanceSync.no_member_id', 'No attd member id')}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn(
                              'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                              row.status === 'absent' ? 'bg-error/10 text-error' : 'bg-success/10 text-success',
                            )}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <select
                              aria-label={t('attendanceSync.match_for', 'Match for {name}').replace('{name}', row.attdName)}
                              value={row.contactId ?? ''}
                              onChange={(event) => {
                                const nextId = event.target.value;
                                let nextName: string | null = null;
                                for (const entry of contacts) {
                                  if (entry.id === nextId) nextName = entry.name;
                                }
                                updateDecision(index, { contactId: nextId === '' ? null : nextId, contactName: nextName });
                              }}
                              className="h-10 w-full min-w-[220px] rounded-xl border border-outline bg-surface px-3 text-sm text-on-surface"
                            >
                              <option value="">
                                {t('attendanceSync.create_walk_in', 'Create walk-in: {name}').replace('{name}', row.attdName)}
                              </option>
                              {contacts.map((entry) => (
                                <option key={entry.id} value={entry.id}>{entry.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-3">
                            {conflict ? (
                              <div className="space-y-2">
                                <div className="text-xs text-on-surface-variant">
                                  {t('attendanceSync.cisa_mark', 'CISA {mark}').replace('{mark}', markLabel(conflict.cisaStatus))}
                                  {' / '}
                                  {t('attendanceSync.attd_mark', 'attd {mark}').replace('{mark}', markLabel(conflict.attdStatus))}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    aria-pressed={row.keepCisa}
                                    onClick={() => updateDecision(index, { keepCisa: true })}
                                    className="rounded-full border border-outline-variant px-2.5 py-1 text-xs font-medium hover:bg-surface-container-high"
                                  >
                                    {t('attendanceSync.keep_cisa', 'Keep CISA')}
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={row.keepCisa === false}
                                    onClick={() => updateDecision(index, { keepCisa: false })}
                                    className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-on-primary"
                                  >
                                    {t('attendanceSync.accept_attd', 'Accept attd')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-on-surface-variant">{t('attendanceSync.no_conflict', 'No conflict')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
    </PopupFrame>
  );
}
