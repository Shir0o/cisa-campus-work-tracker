import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShareDocModal from '../components/modals/ShareDocModal';
import {
  enableGuestAccess,
  regenerateGuestAccess,
  revokeGuestAccess,
  setGuestPermission,
} from '../lib/data/board';
import { guestAccessUrl, type BoardDoc } from '../lib/board';

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({ t: (_k: string, f?: string) => f ?? _k, language: 'en', isSpanish: false }),
}));

vi.mock('../lib/data/board', () => ({
  enableGuestAccess: vi.fn().mockResolvedValue(undefined),
  setGuestPermission: vi.fn().mockResolvedValue(undefined),
  regenerateGuestAccess: vi.fn().mockResolvedValue(undefined),
  revokeGuestAccess: vi.fn().mockResolvedValue(undefined),
}));

const writeText = vi.fn().mockResolvedValue(undefined);

const baseDoc = (overrides: Partial<BoardDoc> = {}): BoardDoc =>
  ({ id: 'doc-1', date: '2026-09-14', title: 'Wednesday care', md: '# Agenda', audience: 'everyone', ...overrides }) as BoardDoc;

describe('ShareDocModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeText.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers to create a link and defaults it to view-only', async () => {
    render(<ShareDocModal doc={baseDoc()} currentUserId="u-1" onClose={() => {}} />);
    expect(screen.getByText('Sharing is off. Create a link to let outside collaborators view or edit this page.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create guest link' }));
    await waitFor(() => expect(enableGuestAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-1' }),
      'view',
      'u-1',
    ));
  });

  it('shows the live link for an enabled view link and copies it', async () => {
    const key = 'sec_abc';
    render(<ShareDocModal doc={baseDoc({ guestAccess: { enabled: true, key, permission: 'view' } })} currentUserId="u-1" onClose={() => {}} />);

    const expected = guestAccessUrl(window.location.origin, 'doc-1', key);
    expect((screen.getByLabelText('Guest link') as HTMLInputElement).value).toBe(expected);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('reports a clipboard failure instead of pretending the link copied', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    render(<ShareDocModal doc={baseDoc({ guestAccess: { enabled: true, key: 'sec_abc', permission: 'view' } })} currentUserId="u-1" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copy failed. Select the link and copy it manually.')).toBeTruthy();
  });

  it('switches between view and edit without rotating the link', async () => {
    render(<ShareDocModal doc={baseDoc({ guestAccess: { enabled: true, key: 'sec_abc', permission: 'view' } })} currentUserId="u-1" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Can edit' }));
    await waitFor(() => expect(setGuestPermission).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-1' }),
      'edit',
      'u-1',
    ));
  });

  it('regenerates with the current permission and revokes on demand', async () => {
    render(<ShareDocModal doc={baseDoc({ guestAccess: { enabled: true, key: 'sec_abc', permission: 'edit' } })} currentUserId="u-1" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate link' }));
    await waitFor(() => expect(regenerateGuestAccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-1' }),
      'edit',
      'u-1',
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }));
    await waitFor(() => expect(revokeGuestAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' }), 'u-1'));
  });

  it('warns before sharing a Team-only page and stays quiet for an open page', () => {
    const first = render(<ShareDocModal doc={baseDoc({ audience: 'team' })} currentUserId="u-1" onClose={() => {}} />);
    expect(screen.getByText('This page is Team only. Anyone with the link can read the pastoral notes on it.')).toBeTruthy();
    first.unmount();

    render(<ShareDocModal doc={baseDoc({ audience: 'everyone' })} currentUserId="u-1" onClose={() => {}} />);
    expect(screen.queryByText('This page is Team only. Anyone with the link can read the pastoral notes on it.')).toBeNull();
  });

  it('surfaces a write failure and closes on request', async () => {
    (enableGuestAccess as any).mockRejectedValueOnce(new Error('offline'));
    const onClose = vi.fn();
    render(<ShareDocModal doc={baseDoc()} currentUserId="u-1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create guest link' }));
    expect(await screen.findByText('Could not update the link. Try again.')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]);
    expect(onClose).toHaveBeenCalled();
  });

  it('treats a disabled config as an unshared page', () => {
    render(<ShareDocModal doc={baseDoc({ guestAccess: { enabled: false, key: 'sec_abc', permission: 'edit' } })} currentUserId="u-1" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Create guest link' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revoke link' })).toBeNull();
  });
});
