import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestAccountPurgeModal from '../components/settings/TestAccountPurgeModal';
import * as testAccountPurge from '../lib/testAccountPurge';

vi.mock('../lib/firebase', () => ({
  db: {},
}));

describe('TestAccountPurgeModal', () => {
  const mockPlan = {
    testUsers: [{ id: 'u-test', path: 'users/u-test' }],
    invitations: [{ id: 'inv-test', path: 'invitations/inv-test' }],
    personalPrayers: [{ id: 'p1', path: 'users/u-test/personalPrayers/p1' }],
    interactions: [{ id: 'i-test', path: 'contacts/c1/interactions/i-test' }],
    contactsCreatedByTestAccounts: [{ id: 'c-test', path: 'contacts/c-test' }],
    totalDeletionsCount: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when isOpen is false', () => {
    const { container } = render(<TestAccountPurgeModal isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('scans and renders the preview breakdown when opened', async () => {
    vi.spyOn(testAccountPurge, 'scanTestAccountTraces').mockResolvedValue(mockPlan);

    render(<TestAccountPurgeModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/Scanning database for test account traces/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Test Account Purge')).toBeInTheDocument();
    });

    expect(screen.getByText('Test accounts:')).toBeInTheDocument();
    expect(screen.getByText('Pending invitations:')).toBeInTheDocument();
    expect(screen.getByText('Personal prayers:')).toBeInTheDocument();
    expect(screen.getByText('Interaction logs:')).toBeInTheDocument();
  });

  it('allows executing purge and displays completion screen', async () => {
    vi.spyOn(testAccountPurge, 'scanTestAccountTraces').mockResolvedValue(mockPlan);
    const purgeSpy = vi.spyOn(testAccountPurge, 'purgeTestAccountTraces').mockResolvedValue({ deletedCount: 4 });
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
    expect(purgeSpy).toHaveBeenCalledWith(expect.anything(), mockPlan, { deleteTestContacts: false });
    expect(onSuccess).toHaveBeenCalledWith(4);
  });

  it('passes deleteTestContacts true when checkbox is checked', async () => {
    vi.spyOn(testAccountPurge, 'scanTestAccountTraces').mockResolvedValue(mockPlan);
    const purgeSpy = vi.spyOn(testAccountPurge, 'purgeTestAccountTraces').mockResolvedValue({ deletedCount: 5 });

    render(<TestAccountPurgeModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Purge Traces/i }));

    await waitFor(() => {
      expect(screen.getByText('Purge Complete')).toBeInTheDocument();
    });

    expect(purgeSpy).toHaveBeenCalledWith(expect.anything(), mockPlan, { deleteTestContacts: true });
  });
});
