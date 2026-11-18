import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { LanguageProvider } from '../../lib/LanguageProvider';
import { BoardScreen } from './BoardScreen';
import { useBoardListData } from '../../lib/useBoardListData';
import type { BoardDoc } from '@cisa/core';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'admin' }),
}));

jest.mock('../../lib/useBoardListData', () => ({
  useBoardListData: jest.fn(),
  boardLeaderName: jest.fn((doc, names) => (doc.facilitatorId ? names[doc.facilitatorId] ?? null : null)),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

describe('BoardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders board screen in English by default', async () => {
    const mockDocs: BoardDoc[] = [
      {
        id: 'doc-1',
        date: '2026-08-24',
        title: 'Team Standup',
        md: '# Standup',
        audience: 'team',
        facilitatorId: 'u1',
      },
    ];

    (useBoardListData as jest.Mock).mockReturnValue({
      loading: false,
      sections: [{ title: 'This week', data: mockDocs }],
      total: 1,
      names: { u1: 'Ana Smith' },
      error: null,
    });

    const { getByText } = await render(
      <LanguageProvider>
        <ThemeProvider>
          <BoardScreen />
        </ThemeProvider>
      </LanguageProvider>,
    );

    expect(getByText('The Board')).toBeTruthy();
    expect(getByText('1 page')).toBeTruthy();
    expect(getByText('What the team talked through, and what came out of it. Open a page to read it.')).toBeTruthy();
    expect(getByText('This week')).toBeTruthy();
    expect(getByText('Team Standup')).toBeTruthy();
    expect(getByText('Team')).toBeTruthy();
    expect(getByText('Ana leading')).toBeTruthy();
    expect(getByText('Pages are written and kept on the desktop site.')).toBeTruthy();
  });
});
