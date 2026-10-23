import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestAccountPurgeModal from '../components/settings/TestAccountPurgeModal';

const postApi = vi.hoisted(() => vi.fn());
vi.mock('../lib/combineClient', () => ({ postCombineApi: postApi }));

describe('TestAccountPurgeModal', () => {
  const mockPlan = {
    accounts: ['users/u-test'],
    logins: ['u-test'],
    invitations: ['invitations/inv-test'],
    personal: ['userPreferences/u-test'],
    interactions: ['contacts/c1/interactions/i-test'],
    notes: [],
    chats: [],
    activity: [],
    asks: [],
    feedback: [],
    contacts: ['contacts/c-test'],
    keptSelf: [] as string[],
  };

  // Answers the preview (dryRun) with the plan, and the purge with `purged`.
  const serve = (purged = { deletedCount: 4, failed: [] as unknown[] }, plan = mockPlan) =>
    postApi.mockImplementation((_url: string, body: { dryRun?: boolean }) =>
      Promise.resolve(body.dryRun ? { plan } : purged),
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when isOpen is false', () => {
    const { container } = render(<TestAccountPurgeModal isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('scans and renders the preview breakdown when opened', async () => {
    serve();

    render(<TestAccountPurgeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/Scanning database for test account traces/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Test accounts:')).toBeInTheDocument();
      expect(screen.getByText('Pending invitations:')).toBeInTheDocument();
      expect(screen.getByText('Sign-in logins:')).toBeInTheDocument();
      expect(screen.getByText('Interaction logs:')).toBeInTheDocument();
    });
    expect(postApi).toHaveBeenCalledWith('/api/test-account-purge', { dryRun: true }, expect.any(String));
  });

  it('renders through the shared popup frame, labelled with its title (#1456)', async () => {
    serve();

    render(<TestAccountPurgeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Test Account Purge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Purge Traces/i })).toBeInTheDocument();
    });
  });

  it('allows executing purge and displays completion screen', async () => {
    serve();
    const onSuccess = vi.fn();

    render(<TestAccountPurgeModal isOpen={true} onClose={vi.fn()} onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Purge Traces/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Purge Traces/i }));

    await waitFor(() => {
      expect(screen.getByText('Purge Complete')).toBeInTheDocument();
    });

    expect(screen.getByText(/Successfully removed 4 test account traces/i)).toBeInTheDocument();
    expect(postApi).toHaveBeenCalledWith('/api/test-account-purge', { deleteTestContacts: false }, expect.any(String));
    expect(onSuccess).toHaveBeenCalledWith(4);
  });

  it('passes deleteTestContacts true when checkbox is checked', async () => {
    serve({ deletedCount: 6, failed: [] });

    render(<TestAccountPurgeModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Purge Traces/i }));

    await waitFor(() => {
      expect(screen.getByText('Purge Complete')).toBeInTheDocument();
    });

    expect(postApi).toHaveBeenCalledWith('/api/test-account-purge', { deleteTestContacts: true }, expect.any(String));
  });

  it('says when the signed-in account is kept, and when some items could not be removed', async () => {
    serve({ deletedCount: 3, failed: [{ target: 'notifications/n1', error: 'boom' }] }, {
      ...mockPlan,
      keptSelf: ['cisa-admin@cisa.campus'],
    });

    render(<TestAccountPurgeModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Your own account \(cisa-admin@cisa.campus\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Purge Traces/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 items could not be removed/)).toBeInTheDocument();
    });
  });
});
