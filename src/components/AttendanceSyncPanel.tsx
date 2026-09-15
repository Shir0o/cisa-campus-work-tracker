import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { subscribePendingAttendanceImports } from '../lib/sync/attdSync';
import type { PendingAttendanceImport } from '../lib/sync/attdCorrelator';
import type { Contact, Gathering, Rhythm } from '../types';
import AttendanceSyncModal from './modals/AttendanceSyncModal';

interface AttendanceSyncPanelProps {
  isAdmin: boolean;
  contacts: Contact[];
  rhythms: Rhythm[];
  gatherings: Gathering[];
  userId?: string;
  userName?: string;
}

export default function AttendanceSyncPanel({
  isAdmin,
  contacts,
  rhythms,
  gatherings,
  userId,
  userName,
}: AttendanceSyncPanelProps) {
  const { t } = useLanguage();
  const [pending, setPending] = useState<PendingAttendanceImport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isAdmin === false) return;
    return subscribePendingAttendanceImports(
      (rows) => setPending(rows),
      (error) => console.error('attendance sync subscription error', error),
    );
  }, [isAdmin]);

  if (isAdmin === false) return null;
  if (pending.length === 0) return null;

  let selected = pending[0];
  for (const entry of pending) {
    if (entry.id === selectedId) selected = entry;
  }

  const openReview = () => {
    setSelectedId(selected.id);
    setOpen(true);
  };

  return (
    <>
      <div
        data-testid="attendance-sync-banner"
        className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary-container px-4 py-3"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary">
          <RefreshCw className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-on-surface">
            {t('attendanceSync.banner_title', 'Pending attendance sync from Attendance Tracker awaiting review')}
          </p>
          <p className="text-xs text-on-surface-variant">
            {t('attendanceSync.banner_count', '{n} draft(s) waiting').replace('{n}', String(pending.length))}
          </p>
        </div>
        <button
          type="button"
          onClick={openReview}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary"
        >
          {t('attendanceSync.review', 'Review sync')}
        </button>
      </div>
      <AttendanceSyncModal
        isOpen={open}
        pendingImport={selected}
        contacts={contacts}
        rhythms={rhythms}
        gatherings={gatherings}
        userId={userId}
        userName={userName}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
