import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { EditContactSheet } from './EditContactSheet';
import { updateContact } from '../../lib/data/contacts';
import { useAuth } from '../../lib/AuthProvider';
import type { Contact } from '@cisa/core';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../lib/data/contacts', () => ({
  updateContact: jest.fn(),
}));

describe('EditContactSheet', () => {
  const mockContact: Contact = {
    id: 'contact_123',
    name: 'Jordan Lee',
    location: 'Dorm A',
    email: 'jordan@college.edu',
    phone: '(555) 234-5678',
    stage: 'Interested',
    lastSeen: '2026-08-15T10:00:00.000Z',
    initials: 'JL',
    tags: ['Freshman', 'Choir'],
    notes: 'Very friendly, likes music',
    metVia: 'Outreach',
    instagram: '@jordan_lee',
    spiritualBackground: 'Christian',
  };

  const mockOnSaved = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      user: { uid: 'user_trainee', displayName: 'Trainee Sam' },
    });
  });

  const renderSheet = async (props?: Partial<React.ComponentProps<typeof EditContactSheet>>) =>
    await render(
      <ThemeProvider>
        <EditContactSheet
          visible={true}
          contact={mockContact}
          room="queue"
          onSaved={mockOnSaved}
          onClose={mockOnClose}
          {...props}
        />
      </ThemeProvider>,
    );

  it('renders all contact fields correctly on open', async () => {
    const { getByDisplayValue, getByText } = await renderSheet();

    expect(getByText('Edit Jordan')).toBeTruthy();
    expect(getByDisplayValue('Jordan')).toBeTruthy();
    expect(getByDisplayValue('Lee')).toBeTruthy();
    expect(getByDisplayValue('(555) 234-5678')).toBeTruthy();
    expect(getByDisplayValue('jordan@college.edu')).toBeTruthy();
    expect(getByDisplayValue('@jordan_lee')).toBeTruthy();
    expect(getByDisplayValue('Dorm A')).toBeTruthy();
    expect(getByDisplayValue('Very friendly, likes music')).toBeTruthy();
  });

  it('toggles tag suggestion chips on and off', async () => {
    const { getByText } = await renderSheet();

    // Initial tags: Freshman, Choir
    expect(getByText('✓ Choir')).toBeTruthy();

    // Toggle Saved tag (from TAG_SUGGESTIONS)
    const savedChip = getByText('+ Saved');
    await fireEvent.press(savedChip);
    expect(getByText('✓ Saved')).toBeTruthy();

    // Toggle off
    await fireEvent.press(getByText('✓ Saved'));
    expect(getByText('+ Saved')).toBeTruthy();
  });

  it('adds custom tags using the custom tag input', async () => {
    const { getByPlaceholderText, getByText } = await renderSheet();

    const tagInput = getByPlaceholderText('Add custom tag…');
    await fireEvent.changeText(tagInput, 'Band');
    await fireEvent.press(getByText('Add'));

    expect(getByText('✓ Band')).toBeTruthy();
  });

  it('calls updateContact and triggers onSaved and onClose on save', async () => {
    (updateContact as jest.Mock).mockResolvedValueOnce(undefined);

    const { getByDisplayValue, getByText } = await renderSheet();

    const phoneInput = getByDisplayValue('(555) 234-5678');
    await fireEvent.changeText(phoneInput, '(555) 999-8888');

    await fireEvent.press(getByText('Save Details'));

    await waitFor(() => {
      expect(updateContact).toHaveBeenCalledWith(
        mockContact,
        expect.objectContaining({
          firstName: 'Jordan',
          lastName: 'Lee',
          phone: '(555) 999-8888',
          email: 'jordan@college.edu',
          instagram: '@jordan_lee',
          notes: 'Very friendly, likes music',
        }),
        { uid: 'user_trainee', name: 'Trainee Sam' },
      );
      expect(mockOnSaved).toHaveBeenCalledWith('Jordan Lee');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('has no "Part of" picker (#1345)', async () => {
    const { queryByText } = await renderSheet();
    for (const label of ['Student', 'Trainee', 'Full-timer', 'Community']) {
      expect(queryByText(label)).toBeNull();
    }
  });

  it('saving an edit to a person with no role writes no role (the old "Student" fallback) (#1345)', async () => {
    (updateContact as jest.Mock).mockResolvedValueOnce(undefined);
    // mockContact has no role; this save used to stamp 'Student' on them.
    const { getByDisplayValue, getByText } = await renderSheet();
    await fireEvent.changeText(getByDisplayValue('(555) 234-5678'), '(555) 999-8888');
    await fireEvent.press(getByText('Save Details'));

    await waitFor(() => expect(updateContact).toHaveBeenCalled());
    expect((updateContact as jest.Mock).mock.calls[0][1]).not.toHaveProperty('role');
  });

  describe('Year and Major (#1348)', () => {
    const savedEdits = () => (updateContact as jest.Mock).mock.calls[0][1];
    const save = async (getByText: (t: string) => unknown) => {
      await fireEvent.press(getByText('Save Details') as never);
      await waitFor(() => expect(updateContact).toHaveBeenCalled());
    };

    it('renders Year as the sign-up list and Major as text, with what is stored', async () => {
      const { getByText, getByDisplayValue } = await renderSheet({
        contact: { ...mockContact, year: 'Junior', major: 'Biology' },
      });
      for (const y of ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Other']) {
        expect(getByText(y)).toBeTruthy();
      }
      expect(getByDisplayValue('Biology')).toBeTruthy();
    });

    it('saves a chosen year and a typed major', async () => {
      (updateContact as jest.Mock).mockResolvedValueOnce(undefined);
      const { getByText, getByPlaceholderText } = await renderSheet({
        contact: { ...mockContact, year: 'Junior' },
      });

      await fireEvent.press(getByText('Senior'));
      await fireEvent.changeText(getByPlaceholderText('e.g. Biology'), 'Music');
      await save(getByText);

      expect(savedEdits()).toMatchObject({ year: 'Senior', major: 'Music' });
    });

    it('Other reveals a text input and saves that text', async () => {
      (updateContact as jest.Mock).mockResolvedValueOnce(undefined);
      const { getByText, queryByPlaceholderText, getByPlaceholderText } = await renderSheet();
      expect(queryByPlaceholderText('Tell us their year')).toBeNull();

      await fireEvent.press(getByText('Other'));
      await fireEvent.changeText(getByPlaceholderText('Tell us their year'), '  Gap year ');
      await save(getByText);

      expect(savedEdits()).toMatchObject({ year: 'Gap year' });
    });

    it('shows a stored off-list year as Other plus its text and saves nothing for it', async () => {
      (updateContact as jest.Mock).mockResolvedValueOnce(undefined);
      const { getByText, getByDisplayValue } = await renderSheet({
        contact: { ...mockContact, year: 'Taking one class on Thursday F26' },
      });
      expect(getByDisplayValue('Taking one class on Thursday F26')).toBeTruthy();

      await fireEvent.changeText(getByDisplayValue('(555) 234-5678'), '(555) 999-8888');
      await save(getByText);

      // Untouched, so it is not rewritten (and the story gets no year line).
      expect(savedEdits()).not.toHaveProperty('year');
      expect(savedEdits()).not.toHaveProperty('major');
    });

    it('clears both fields', async () => {
      (updateContact as jest.Mock).mockResolvedValueOnce(undefined);
      const { getByText, getByDisplayValue } = await renderSheet({
        contact: { ...mockContact, year: 'Senior', major: 'Music' },
      });

      await fireEvent.press(getByText('Senior')); // tapping the chosen year again clears it
      await fireEvent.changeText(getByDisplayValue('Music'), '');
      await save(getByText);

      expect(savedEdits()).toMatchObject({ year: '', major: '' });
    });

    it('counts as a change when closing', async () => {
      const spyAlert = jest.spyOn(Alert, 'alert');
      const { getByText } = await renderSheet();
      await fireEvent.press(getByText('Junior'));
      await fireEvent.press(getByText('Cancel'));
      expect(spyAlert).toHaveBeenCalled();
    });
  });

  describe('How we met and Address', () => {
    const savedEdits = () => (updateContact as jest.Mock).mock.calls[0][1];
    const save = async (getByText: (t: string) => unknown) => {
      await fireEvent.press(getByText('Save Details') as never);
      await waitFor(() => expect(updateContact).toHaveBeenCalled());
    };

    it('saves a changed how-we-met and address', async () => {
      (updateContact as jest.Mock).mockResolvedValueOnce(undefined);
      const { getByText, getByDisplayValue } = await renderSheet();
      await fireEvent.press(getByText('A friend brought them'));
      await fireEvent.changeText(getByDisplayValue('Dorm A'), '  Dorm B ');
      await save(getByText);
      expect(savedEdits()).toMatchObject({ metVia: 'A friend brought them', location: 'Dorm B' });
    });

    it('saves a cleared how-we-met and address', async () => {
      (updateContact as jest.Mock).mockResolvedValueOnce(undefined);
      const { getByText, getByDisplayValue } = await renderSheet();
      await fireEvent.press(getByText('Outreach')); // tapping the chosen chip again clears it
      await fireEvent.changeText(getByDisplayValue('Dorm A'), '');
      await save(getByText);
      expect(savedEdits()).toMatchObject({ metVia: '', location: '' });
    });

    it('sends neither when untouched', async () => {
      (updateContact as jest.Mock).mockResolvedValueOnce(undefined);
      const { getByText, getByDisplayValue } = await renderSheet({
        contact: { ...mockContact, metVia: undefined, location: '' },
      });
      await fireEvent.changeText(getByDisplayValue('(555) 234-5678'), '(555) 999-8888');
      await save(getByText);
      expect(savedEdits()).not.toHaveProperty('metVia');
      expect(savedEdits()).not.toHaveProperty('location');
    });
  });

  it('closes directly when clean without prompt', async () => {
    const spyAlert = jest.spyOn(Alert, 'alert');
    const { getByText } = await renderSheet();

    await fireEvent.press(getByText('Cancel'));
    expect(spyAlert).not.toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('prompts confirmation when dirty on cancel', async () => {
    const spyAlert = jest.spyOn(Alert, 'alert');
    const { getByDisplayValue, getByText } = await renderSheet();

    const notesInput = getByDisplayValue('Very friendly, likes music');
    await fireEvent.changeText(notesInput, 'Changed notes');

    await fireEvent.press(getByText('Cancel'));
    expect(spyAlert).toHaveBeenCalledWith(
      expect.stringContaining('Discard'),
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringMatching(/cancel|keep/i) }),
        expect.objectContaining({ text: expect.stringContaining('Discard') }),
      ]),
    );
  });
});
