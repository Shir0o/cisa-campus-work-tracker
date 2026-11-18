import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContactComposer from '../components/contact/ContactComposer';
import { emptyComposer, type ComposerValue } from '../lib/contactComposer';
import * as firestore from 'firebase/firestore';

// The Visit picker lists the people the reader can see, the way Log interaction
// does, so it reads the roster through the same query builder.
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, role: 'admin' }),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' },
}));

const roster = [
  { id: 'sam', name: 'Sam Reyes' },
  { id: 'ama', name: 'Ama Osei' },
  { id: 'bo', name: 'Bo Chen' },
];
const serveRoster = () =>
  (firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_q: unknown, next: (s: unknown) => void) => {
      next({ docs: roster.map(({ id, ...data }) => ({ id, data: () => data })) });
      return () => {};
    },
  );

// A controlled harness so the test asserts through the same onChange seam the
// real story composer uses (ContactDetailsModal passes setComposer here). It
// seeds from the real clock so the chip opens reading "Now".
function Harness() {
  const [value, setValue] = React.useState<ComposerValue>(() => emptyComposer());
  return (
    <ContactComposer
      open
      value={value}
      onChange={setValue}
      onOpen={() => {}}
      onCancel={() => {}}
      onSubmit={(e) => e.preventDefault()}
      submitting={false}
      firstName="Sam"
    />
  );
}

describe('ContactComposer time picker (#1495)', () => {
  it('lets a staffer pick an arbitrary date and time stored as yyyy-MM-ddTHH:mm', () => {
    render(<Harness />);

    // Open the "when" popover from its chip.
    fireEvent.click(screen.getByRole('button', { name: /^now$/i }));

    const picker = screen.getByLabelText(/^date and time$/i);
    // Initial value is the composer's now, in the datetime-local shape.
    expect((picker as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    // Any moment, not just the presets: a date well outside the preset list.
    fireEvent.change(picker, { target: { value: '2026-09-15T09:45' } });

    expect(picker).toHaveValue('2026-09-15T09:45');
    // The chip reads the chosen moment back (the "older" reading).
    expect(screen.getByRole('button', { name: /Sep 15, 9:45/i })).toBeInTheDocument();
  });

  it('keeps the presets as one-tap shortcuts beside the picker', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /^now$/i }));

    // The picker is present, and the old shortcuts remain available.
    expect(screen.getByLabelText(/^date and time$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /15 minutes ago/i })).toBeInTheDocument();
  });

  it('interpolates a real time into the Yesterday shortcut (#1638)', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /^now$/i }));

    // The shortcut names a real clock time, never the raw locale placeholder.
    const yesterday = screen.getByRole('button', { name: /^yesterday/i });
    expect(yesterday).not.toHaveTextContent('{time}');
    expect(yesterday).toHaveTextContent(/^Yesterday, \d{1,2}:\d{2}\s?(AM|PM)$/i);
  });
});

describe('ContactComposer time picker dismissal (#1801)', () => {
  const openTimePicker = () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^now$/i }));
    return screen.getByRole('dialog', { name: /choose date and time/i });
  };
  const picker = () => screen.queryByRole('dialog', { name: /choose date and time/i });

  it('closes with Escape after a time is typed by hand', () => {
    openTimePicker();
    const field = screen.getByLabelText(/^date and time$/i);

    fireEvent.change(field, { target: { value: '2026-09-15T09:45' } });
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(picker()).toBeNull();
    // The hand-typed moment survives the dismissal, and focus goes home.
    expect(screen.getByRole('button', { name: /Sep 15, 9:45/i })).toHaveFocus();
  });

  it('answers Escape itself instead of letting the page close underneath (#1761)', () => {
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    try {
      openTimePicker();
      const field = screen.getByLabelText(/^date and time$/i);
      fireEvent.keyDown(field, { key: 'Escape' });

      expect(picker()).toBeNull();
      expect(outer).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', outer);
    }
  });

  it('closes when the reader clicks away', () => {
    openTimePicker();

    fireEvent.mouseDown(document.body);

    expect(picker()).toBeNull();
  });

  it('offers a Done exit in the popover that returns focus to its chip', () => {
    openTimePicker();

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));

    expect(picker()).toBeNull();
    expect(screen.getByRole('button', { name: /^now$/i })).toHaveFocus();
  });
});

describe('ContactComposer — edit variant (#1673, #1674)', () => {
  const renderEdit = (value: ComposerValue, onCancel = () => {}) =>
    render(
      <ContactComposer
        open
        variant="edit"
        value={value}
        onChange={() => {}}
        onOpen={() => {}}
        onCancel={onCancel}
        onSubmit={(e) => e.preventDefault()}
        submitting={false}
        canLogOnBehalf
        teamMembers={[{ id: 'jae', name: 'Jae' }]}
        firstName="Sam"
      />,
    );

  it('edits an interaction with the chip row and Save, no kind switch or who-reached picker', () => {
    renderEdit({ ...emptyComposer(), text: 'Coffee', type: 'meeting' });

    expect(screen.getByRole('button', { name: 'Meeting' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /kind/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prayer' })).toBeNull();
    expect(screen.queryByText(/Jae|By me/)).toBeNull();
  });

  it('edits a prayer with its request, context and Save prayer', () => {
    renderEdit({ ...emptyComposer(), mode: 'prayer', text: 'For her interview', context: 'Nervous.' });

    expect(screen.getByText('Editing prayer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('For her interview')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Nervous.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save prayer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Meeting' })).toBeNull();
  });

  it('cancels on Escape', () => {
    let cancelled = 0;
    renderEdit({ ...emptyComposer(), text: 'Coffee' }, () => (cancelled += 1));
    fireEvent.keyDown(screen.getByDisplayValue('Coffee'), { key: 'Escape' });
    expect(cancelled).toBe(1);
  });
});

// Cut-or-keep §5: a Visit is logged on the person's page like any interaction,
// and can name the other people seen in the same visit.
describe('ContactComposer — Visit with several people (cut-or-keep §5)', () => {
  function VisitHarness({ contactId = 'sam' }: { contactId?: string }) {
    const [value, setValue] = React.useState<ComposerValue>(() => emptyComposer());
    return (
      <>
        <ContactComposer
          open
          value={value}
          onChange={setValue}
          onOpen={() => {}}
          onCancel={() => {}}
          onSubmit={(e) => e.preventDefault()}
          submitting={false}
          firstName="Sam"
          contactId={contactId}
        />
        <output data-testid="with">{JSON.stringify(value.withPeople)}</output>
      </>
    );
  }
  const withValue = () => JSON.parse(screen.getByTestId('with').textContent || 'null');

  it('offers Visit beside the other kinds', () => {
    render(<VisitHarness />);
    expect(screen.getByRole('button', { name: 'Visit' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows no people picker until Visit is chosen', () => {
    render(<VisitHarness />);
    expect(screen.queryByRole('button', { name: 'Add people' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Visit' }));
    expect(screen.getByRole('button', { name: 'Add people' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    expect(screen.queryByRole('button', { name: 'Add people' })).toBeNull();
  });

  it('adds other people from the roster, never the person whose page it is', () => {
    serveRoster();
    render(<VisitHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Visit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }));

    const menu = screen.getByRole('dialog', { name: 'Add people' });
    expect(within(menu).queryByRole('button', { name: /Sam Reyes/ })).toBeNull();
    fireEvent.click(within(menu).getByRole('button', { name: /Ama Osei/ }));
    fireEvent.click(within(menu).getByRole('button', { name: /Bo Chen/ }));

    expect(withValue()).toEqual([
      { id: 'ama', name: 'Ama Osei' },
      { id: 'bo', name: 'Bo Chen' },
    ]);
  });

  it('narrows the roster as the reader types', () => {
    serveRoster();
    render(<VisitHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Visit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }));
    const menu = screen.getByRole('dialog', { name: 'Add people' });
    fireEvent.change(within(menu).getByRole('textbox', { name: 'Search people' }), { target: { value: 'bo' } });
    expect(within(menu).getByRole('button', { name: /Bo Chen/ })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: /Ama Osei/ })).toBeNull();
  });

  it('shows who is with them and takes one back off', () => {
    serveRoster();
    render(<VisitHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Visit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Add people' })).getByRole('button', { name: /Ama Osei/ }));
    fireEvent.mouseDown(document.body);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Ama Osei' }));
    expect(withValue()).toEqual([]);
  });

  it('drops the others again when the kind changes away from Visit', () => {
    serveRoster();
    render(<VisitHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Visit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add people' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Add people' })).getByRole('button', { name: /Ama Osei/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    expect(withValue()).toEqual([]);
  });

  it('keeps the edit variant to the one entry being edited', () => {
    render(
      <ContactComposer
        open
        variant="edit"
        value={{ ...emptyComposer(), text: 'Dinner', type: 'visit' }}
        onChange={() => {}}
        onOpen={() => {}}
        onCancel={() => {}}
        onSubmit={(e) => e.preventDefault()}
        submitting={false}
        firstName="Sam"
      />,
    );
    expect(screen.getByRole('button', { name: 'Visit' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Add people' })).toBeNull();
  });
});
