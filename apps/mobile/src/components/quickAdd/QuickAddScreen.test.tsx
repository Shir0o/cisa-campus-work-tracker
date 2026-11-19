// Quick add on the phone (§26): one box, parse, then a preview where nothing
// saves until Save. Several name matches are all offered, none chosen.
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QuickAddScreen } from './QuickAddScreen';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { requestQuickAddParse } from '../../lib/quickAddParse';
import { saveQuickAdd } from '../../lib/data/quickAdd';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'u1', user: { displayName: 'Mei Tanaka' }, role: 'admin' }),
}));
jest.mock('../../lib/quickAddParse', () => ({ requestQuickAddParse: jest.fn() }));
jest.mock('../../lib/data/quickAdd', () => ({ saveQuickAdd: jest.fn() }));

const parsed = {
  contact: {
    name: 'Jordan Lee',
    phone: '(555) 010-2030',
    email: 'jordan-lee-contact',
    year: 'Sophomore',
    step: 'contact',
    tags: ['Bible study'],
  },
  match: [] as { id: string; name: string }[],
  interaction: { type: 'meeting', when: '2026-11-17', notes: 'Met at the club table' },
  prayer: 'pray for his exams',
  reminder: { when: '2026-11-24', text: 'Text Jordan about Bible study' },
};

const renderScreen = async () =>
  await render(
    <ThemeProvider>
      <QuickAddScreen />
    </ThemeProvider>,
  );

const parse = async (screen: Awaited<ReturnType<typeof renderScreen>>, body: Record<string, unknown>) => {
  (requestQuickAddParse as jest.Mock).mockResolvedValueOnce(body);
  await fireEvent.changeText(screen.getByLabelText('What happened?'), 'Met Jordan at the club table');
  await fireEvent.press(screen.getByText('Parse with Gemini'));
  await waitFor(() => expect(screen.getByText('Save')).toBeTruthy());
};

beforeEach(() => {
  jest.clearAllMocks();
  (saveQuickAdd as jest.Mock).mockResolvedValue({ contactId: 'c-new', createdContact: true });
});

describe('QuickAddScreen', () => {
  it('blocks Save when no name was parsed and no match is picked', async () => {
    const screen = await renderScreen();
    await parse(screen, {
      contact: { name: '', phone: '', email: '', year: '', step: '', tags: [] },
      match: [],
    });

    await fireEvent.press(screen.getByText('Save'));
    expect(saveQuickAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Add a name, or pick someone already in your directory.')).toBeTruthy();
  });

  it('offers every name match and preselects none when there are several', async () => {
    const screen = await renderScreen();
    await parse(screen, {
      ...parsed,
      match: [
        { id: 'c1', name: 'Jordan Lee' },
        { id: 'c2', name: 'Jordan Lee' },
      ],
    });

    const options = screen.getAllByRole('button', { name: 'Jordan Lee' });
    expect(options).toHaveLength(2);
    for (const option of options) expect(option.props.accessibilityState.selected).toBe(false);
    expect(screen.getByRole('button', { name: 'New person' }).props.accessibilityState.selected).toBe(true);

    await fireEvent.press(options[1]);
    const afterPick = screen.getAllByRole('button', { name: 'Jordan Lee' });
    expect(afterPick[1].props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(saveQuickAdd).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: 'c2', matchName: 'Jordan Lee' }),
        expect.anything(),
      ),
    );
  });

  it('saves the contact, interaction, prayer and reminder together', async () => {
    const screen = await renderScreen();
    await parse(screen, parsed);
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(saveQuickAdd).toHaveBeenCalledTimes(1));
    expect((saveQuickAdd as jest.Mock).mock.calls[0][0]).toMatchObject({
      contact: expect.objectContaining({ name: 'Jordan Lee', year: 'Sophomore', step: 'contact' }),
      interaction: { type: 'meeting', when: '2026-11-17', notes: 'Met at the club table' },
      prayer: 'pray for his exams',
      reminder: { when: '2026-11-24', text: 'Text Jordan about Bible study' },
    });
  });
});
