import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AttendanceSyncPanel from '../components/AttendanceSyncPanel';
import { subscribePendingAttendanceImports } from '../lib/sync/attdSync';
import type { PendingAttendanceImport } from '../lib/sync/attdCorrelator';

vi.mock('../lib/sync/attdSync', () => ({
  subscribePendingAttendanceImports: vi.fn(),
}));

vi.mock('../components/modals/AttendanceSyncModal', () => ({
  default: () => <div data-testid="sync-modal">Sync modal</div>,
}));

const pending: PendingAttendanceImport = {
  id: 'import-1',
  attdEventId: 'event-1',
  eventName: 'Wednesday Bible Study',
  frequency: 'Weekly',
  repeatingDays: ['Wednesday'],
  sessionDate: '2026-09-16',
  records: [],
  preview: {
    attdEventId: 'event-1',
    eventName: 'Wednesday Bible Study',
    sessionDate: '2026-09-16',
    rhythmId: 'r1',
    rhythmName: 'Wednesday Bible Study',
    gatheringId: 'g1',
    gatheringName: 'Wednesday Bible Study',
    matchSource: 'cadence',
    attendees: [],
    conflicts: [],
    stats: { total: 0, present: 0, late: 0, absent: 0, matched: 0, walkIns: 0, conflicts: 0 },
  },
  status: 'pending',
};

describe('AttendanceSyncPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subscribePendingAttendanceImports).mockImplementation((cb) => {
      cb([pending]);
      return vi.fn();
    });
  });

  it('shows the pending review banner and opens the modal', async () => {
    render(<AttendanceSyncPanel isAdmin contacts={[]} rhythms={[]} gatherings={[]} />);
    expect(screen.getByText('Pending attendance sync from Attendance Tracker awaiting review')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Review sync'));
    await waitFor(() => {
      expect(screen.getByTestId('sync-modal')).toBeInTheDocument();
    });
  });

  it('stays hidden for non-admins', () => {
    const { container } = render(<AttendanceSyncPanel isAdmin={false} contacts={[]} rhythms={[]} gatherings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
