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
    role: 'Student',
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

  const renderSheet = (props?: Partial<React.ComponentProps<typeof EditContactSheet>>) =>
    render(
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

  it('renders all contact fields correctly on open', () => {
    const { getByDisplayValue, getByText } = renderSheet();

    expect(getByText('Edit Jordan')).toBeTruthy();
    expect(getByDisplayValue('Jordan')).toBeTruthy();
    expect(getByDisplayValue('Lee')).toBeTruthy();
    expect(getByDisplayValue('(555) 234-5678')).toBeTruthy();
    expect(getByDisplayValue('jordan@college.edu')).toBeTruthy();
    expect(getByDisplayValue('@jordan_lee')).toBeTruthy();
    expect(getByDisplayValue('Dorm A')).toBeTruthy();
    expect(getByDisplayValue('Very friendly, likes music')).toBeTruthy();
  });

  it('toggles tag suggestion chips on and off', () => {
    const { getByText } = renderSheet();

    // Initial tags: Freshman, Choir
    expect(getByText('✓ Choir')).toBeTruthy();

    // Toggle Saved tag (from TAG_SUGGESTIONS)
    const savedChip = getByText('+ Saved');
    fireEvent.press(savedChip);
    expect(getByText('✓ Saved')).toBeTruthy();

    // Toggle off
    fireEvent.press(getByText('✓ Saved'));
    expect(getByText('+ Saved')).toBeTruthy();
  });

  it('adds custom tags using the custom tag input', () => {
    const { getByPlaceholderText, getByText } = renderSheet();

    const tagInput = getByPlaceholderText('Add custom tag…');
    fireEvent.changeText(tagInput, 'Band');
    fireEvent.press(getByText('Add'));

    expect(getByText('✓ Band')).toBeTruthy();
  });

  it('calls updateContact and triggers onSaved and onClose on save', async () => {
    (updateContact as jest.Mock).mockResolvedValueOnce(undefined);

    const { getByDisplayValue, getByText } = renderSheet();

    const phoneInput = getByDisplayValue('(555) 234-5678');
    fireEvent.changeText(phoneInput, '(555) 999-8888');

    fireEvent.press(getByText('Save Details'));

    await waitFor(() => {
      expect(updateContact).toHaveBeenCalledWith(
        mockContact,
        expect.objectContaining({
          firstName: 'Jordan',
          lastName: 'Lee',
          phone: '(555) 999-8888',
          email: 'jordan@college.edu',
          instagram: '@jordan_lee',
          location: 'Dorm A',
          notes: 'Very friendly, likes music',
          role: 'Student',
          metVia: 'Outreach',
        }),
        { uid: 'user_trainee', name: 'Trainee Sam' },
      );
      expect(mockOnSaved).toHaveBeenCalledWith('Jordan Lee');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('closes directly when clean without prompt', () => {
    const spyAlert = jest.spyOn(Alert, 'alert');
    const { getByText } = renderSheet();

    fireEvent.press(getByText('Cancel'));
    expect(spyAlert).not.toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('prompts confirmation when dirty on cancel', () => {
    const spyAlert = jest.spyOn(Alert, 'alert');
    const { getByDisplayValue, getByText } = renderSheet();

    const notesInput = getByDisplayValue('Very friendly, likes music');
    fireEvent.changeText(notesInput, 'Changed notes');

    fireEvent.press(getByText('Cancel'));
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
