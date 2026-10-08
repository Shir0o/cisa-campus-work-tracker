import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CombinedFromBanner from '../components/contact/CombinedFromBanner';
import type { CombinedFrom } from '../types';

vi.mock('../lib/firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('tok') } },
}));

const combinedFrom: CombinedFrom = {
  name: 'Jane Duplicate',
  at: '2026-10-01T10:00:00.000Z',
  byName: 'Admin Tony',
  combineRecordId: 'rec-1',
};

const preview = {
  goesBack: [{ kind: 'interactions', id: 'i1', label: 'Called about the retreat' }],
  stays: [{ kind: 'interactions', id: 'new1', label: 'Added later' }],
  notRestored: [{ kind: 'field', label: 'location' }],
};

const okResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('CombinedFromBanner (#1434)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the line without any undo control to a non-Full-timer', () => {
    render(<CombinedFromBanner combinedFrom={combinedFrom} isFullTimer={false} />);

    expect(
      screen.getByText('Combined from Jane Duplicate on 10/1/2026 by Admin Tony'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /See what moved/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo combine/i })).not.toBeInTheDocument();
  });

  it('shows See what moved and Undo combine to a Full-timer', () => {
    render(<CombinedFromBanner combinedFrom={combinedFrom} isFullTimer />);

    expect(screen.getByRole('button', { name: /See what moved/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Undo combine/i })).toBeInTheDocument();
  });

  it('loads the moved items from the record when See what moved is pressed', async () => {
    fetchMock.mockReturnValue(okResponse({ success: true, preview }));
    render(<CombinedFromBanner combinedFrom={combinedFrom} isFullTimer />);

    fireEvent.click(screen.getByRole('button', { name: /See what moved/i }));

    expect(await screen.findByText('Called about the retreat')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/combine-contacts/undo',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body).toEqual({ combineRecordId: 'rec-1', dryRun: true });
    // "See what moved" is read-only: no confirm control.
    expect(screen.queryByRole('button', { name: /Confirm undo/i })).not.toBeInTheDocument();
  });

  it('undoes the combine after a confirmation and hides the banner', async () => {
    fetchMock.mockReturnValue(okResponse({ success: true, preview }));
    render(<CombinedFromBanner combinedFrom={combinedFrom} isFullTimer />);

    fireEvent.click(screen.getByRole('button', { name: /Undo combine/i }));
    const confirm = await screen.findByRole('button', { name: /Confirm undo/i });
    fetchMock.mockReturnValue(okResponse({ success: true }));
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(screen.queryByTestId('combined-from-banner')).not.toBeInTheDocument(),
    );
    const lastBody = JSON.parse((fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as any).body);
    expect(lastBody).toEqual({ combineRecordId: 'rec-1', dryRun: false });
  });

  it('surfaces an error when the undo request fails', async () => {
    fetchMock.mockReturnValue(
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Already undone' }) }),
    );
    render(<CombinedFromBanner combinedFrom={combinedFrom} isFullTimer />);

    fireEvent.click(screen.getByRole('button', { name: /See what moved/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Already undone');
  });
});
