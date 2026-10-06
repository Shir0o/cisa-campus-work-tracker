import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import CombineTagsModal from '../components/modals/CombineTagsModal';
import { useAuth } from '../components/AuthProvider';
import { logActivity } from '../lib/firebase';
import type { Contact } from '../types';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({
    t: (key: string, fallback?: string) => {
      const dict: Record<string, string> = {
        'modals.combine_tags': 'Combine tags',
        'modals.dry_run_preview': 'Dry-run preview — no changes are saved until you confirm.',
        'modals.no_duplicate_tags': 'No duplicate or overlapping tags found.',
        'modals.season_variants': 'Season variants like “Fall \'26” and “Fall 2026” would be combined here.',
        'modals.rules_to_combine': 'Proposed tag rules ({count})',
        'modals.rule_contacts_count': '{n} {count}',
        'modals.select_all_rules': 'Select all',
        'modals.deselect_all_rules': 'Deselect all',
        'modals.contacts_would_change': '{n} {count} would have their tags combined.',
        'modals.nothing_to_combine': 'Nothing to combine',
        'modals.contact_singular': 'contact',
        'modals.contacts': 'contacts',
        'modals.before': 'Before:',
        'modals.after': 'After:',
        'modals.cancel': 'Cancel',
        'modals.combine_n_contacts': 'Combine {n} {count}',
      };
      return dict[key] || fallback || key;
    },
  }),
}));

const mockUpdate = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  writeBatch: vi.fn(() => ({
    update: mockUpdate,
    commit: mockCommit,
  })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' },
  logActivity: vi.fn(),
}));

describe('CombineTagsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: 'u1', displayName: 'Staff User' },
    });
  });

  it('renders clean empty state when there are no duplicate or suffixed tags', () => {
    const contacts: Contact[] = [
      { id: 'c1', name: 'Alice', tags: ['Saved'] } as Contact,
      { id: 'c2', name: 'Bob', tags: ['Baptized'] } as Contact,
    ];

    render(<CombineTagsModal contacts={contacts} onClose={vi.fn()} />);
    expect(screen.getByText('No duplicate or overlapping tags found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nothing to combine/i })).toBeDisabled();
  });

  it('displays discovered rules, allows toggling checkboxes, and commits batch on apply', async () => {
    const contacts: Contact[] = [
      { id: 'c1', name: 'Student 1', tags: ['BFA table'] } as Contact,
      { id: 'c2', name: 'Student 2', tags: ['bfa-table'] } as Contact,
      { id: 'c3', name: 'Student 3', tags: ['Club rush table'] } as Contact,
    ];

    const onApplied = vi.fn();
    const onClose = vi.fn();

    render(
      <CombineTagsModal
        contacts={contacts}
        onClose={onClose}
        onApplied={onApplied}
      />,
    );

    // Shows 2 proposed rules: BFA table variants -> BFA, and Club rush table -> Club Rush
    expect(screen.getByText(/Proposed tag rules \(2\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('BFA').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Club Rush').length).toBeGreaterThanOrEqual(1);

    // Checkboxes are rendered and checked by default
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(true);

    // Initial button text shows all 3 contacts
    const applyBtn = screen.getByRole('button', { name: /Combine 3 contacts/i });
    expect(applyBtn).toBeEnabled();

    // Uncheck first rule
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0].checked).toBe(false);

    // Now button text should update to reflect only remaining enabled rule
    expect(screen.getByRole('button', { name: /Combine 1 contact/i })).toBeEnabled();

    // Deselect all
    fireEvent.click(screen.getByRole('button', { name: /^Deselect all$/i }));
    expect(screen.getByRole('button', { name: /nothing to combine/i })).toBeDisabled();

    // Select all back
    fireEvent.click(screen.getByRole('button', { name: /^Select all$/i }));
    const finalApplyBtn = screen.getByRole('button', { name: /Combine 3 contacts/i });
    expect(finalApplyBtn).toBeEnabled();

    // Click apply
    fireEvent.click(finalApplyBtn);
    await waitFor(() => {
      expect(mockCommit).toHaveBeenCalled();
      expect(onApplied).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(logActivity).toHaveBeenCalledTimes(3);
  });
});
