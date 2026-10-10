import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ContactComposer from '../components/contact/ContactComposer';
import { emptyComposer, type ComposerValue } from '../lib/contactComposer';

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
});
