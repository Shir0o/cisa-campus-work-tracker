import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AttendanceSyncModal from '../components/modals/AttendanceSyncModal';
import { confirmAttendanceImport, discardPendingAttendanceImport } from '../lib/sync/attdSync';
import type { PendingAttendanceImport } from '../lib/sync/attdCorrelator';
import type { Contact, Gathering, Rhythm } from '../types';

vi.mock('../lib/sync/attdSync', () => ({
  confirmAttendanceImport: vi.fn().mockResolvedValue(undefined),
  discardPendingAttendanceImport: vi.fn().mockResolvedValue(undefined),
  subscribePendingAttendanceImports: vi.fn(() => vi.fn()),
}));

const contact = (id: string, name: string): Contact => ({
  id,
  name,
  role: 'Student',
  location: '',
  email: '',
  phone: '',
  stage: 'Lead',
  lastSeen: '',
  initials: name,
});

const study: Rhythm = {
  id: 'r1',
  name: 'Wednesday Bible Study',
  cadence: { type: 'weekly', days: [3] },
  roster: [],
  termStart: '2026-09-01',
  termEnd: '2026-12-31',
  createdAt: '2026-09-01T00:00:00.000Z',
  createdById: 'u1',
};

const week: Gathering = {
  id: 'g1',
  name: 'Wednesday Bible Study',
  date: '2026-09-16',
  order: 0,
  rhythmId: 'r1',
  createdAt: '2026-09-01T00:00:00.000Z',
  attendance: { present: [], absent: ['c1'] },
};

const pending: PendingAttendanceImport = {
  id: 'import-1',
  attdEventId: 'event-1',
  eventName: 'Wednesday Bible Study',
  frequency: 'Weekly',
  repeatingDays: ['Wednesday'],
  sessionDate: '2026-09-16',
  records: [
    { memberId: 'm1', attendee: 'Alex Chen', status: 'present', isLate: false },
    { attendee: 'New Person', status: 'late', isLate: true },
  ],
  preview: {
    attdEventId: 'event-1',
    eventName: 'Wednesday Bible Study',
    sessionDate: '2026-09-16',
    rhythmId: 'r1',
    rhythmName: 'Wednesday Bible Study',
    gatheringId: 'g1',
    gatheringName: 'Wednesday Bible Study',
    matchSource: 'cadence',
    attendees: [
      {
        memberId: 'm1',
        attdName: 'Alex Chen',
        status: 'present',
        isLate: false,
        contactId: 'c1',
        contactName: 'Alex Chen',
        matchType: 'alias',
        confidence: 1,
      },
      {
        memberId: null,
        attdName: 'New Person',
        status: 'late',
        isLate: true,
        contactId: null,
        contactName: null,
        matchType: 'new',
        confidence: 0,
      },
    ],
    conflicts: [
      { contactId: 'c1', contactName: 'Alex Chen', attdStatus: 'present', cisaStatus: 'absent' },
    ],
    stats: { total: 2, present: 1, late: 1, absent: 0, matched: 1, walkIns: 1, conflicts: 1 },
  },
  status: 'pending',
};

describe('AttendanceSyncModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = () =>
    render(
      <AttendanceSyncModal
        isOpen
        pendingImport={pending}
        contacts={[contact('c1', 'Alex Chen'), contact('c2', 'Jordan Patel')]}
        rhythms={[study]}
        gatherings={[week]}
        userId="u-admin"
        userName="Admin"
        onClose={vi.fn()}
      />,
    );

  it('renders the dry-run table and conflict actions', () => {
    renderModal();
    expect(screen.getByText('Review attendance sync')).toBeInTheDocument();
    expect(screen.getAllByText('Alex Chen').length).toBeGreaterThan(0);
    expect(screen.getByText('New Person')).toBeInTheDocument();
    expect(screen.getByText('Accept all attd')).toBeInTheDocument();
    expect(screen.getByText('Confirm sync')).toBeInTheDocument();
  });

  it('confirms the staged import with the chosen target and decisions', async () => {
    renderModal();
    await userEvent.click(screen.getByText('Accept all attd'));
    await userEvent.click(screen.getByText('Confirm sync'));

    await waitFor(() => {
      expect(confirmAttendanceImport).toHaveBeenCalledTimes(1);
    });
    expect(confirmAttendanceImport).toHaveBeenCalledWith(
      expect.objectContaining({
        importId: 'import-1',
        targetRhythmId: 'r1',
        targetGatheringId: 'g1',
        createGathering: false,
      }),
    );
  });

  it('lets a reviewer change an unmatched row to an existing contact', async () => {
    renderModal();
    await userEvent.selectOptions(screen.getByLabelText('Match for New Person'), 'c1');
    await userEvent.click(screen.getByText('Confirm sync'));

    await waitFor(() => {
      expect(confirmAttendanceImport).toHaveBeenCalledTimes(1);
    });
    const call = vi.mocked(confirmAttendanceImport).mock.calls[0][0];
    expect(call.decisions[1].contactId).toBe('c1');
    expect(call.decisions[1].contactName).toBe('Alex Chen');
  });

  it('discards the draft', async () => {
    renderModal();
    await userEvent.click(screen.getByText('Discard draft'));

    await waitFor(() => {
      expect(discardPendingAttendanceImport).toHaveBeenCalledWith('import-1');
    });
  });

  it('surfaces a confirm failure', async () => {
    vi.mocked(confirmAttendanceImport).mockRejectedValueOnce(new Error('Network down'));
    renderModal();
    await userEvent.click(screen.getByText('Confirm sync'));

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });
});
