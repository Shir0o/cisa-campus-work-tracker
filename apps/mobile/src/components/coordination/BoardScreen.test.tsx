import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { LanguageProvider } from '../../lib/LanguageProvider';
import { BoardScreen } from './BoardScreen';
import { useBoardListData } from '../../lib/useBoardListData';
import { setCachedTranslation, clearTranslationCache } from '../../lib/translator';
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

describe('BoardScreen Spanish Translation', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await clearTranslationCache();
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => ({ success: true, targetLang: 'es', translations: [] }),
    } as any));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
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

    const { getByText } = render(
      <LanguageProvider defaultLanguage="en">
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

  it('renders board screen and translated row titles in Spanish', async () => {
    const mockDocs: BoardDoc[] = [
      {
        id: 'doc-1',
        date: '2026-08-24',
        title: 'Team Standup',
        md: '# Standup',
        audience: 'team',
        facilitatorId: 'u1',
      },
      {
        id: 'doc-2',
        date: '2026-08-10',
        title: 'Gospel Fellowship Night',
        md: '# Gospel Night',
        audience: 'everyone',
        facilitatorId: 'u2',
      },
    ];

    setCachedTranslation('Team Standup', 'Reunión del equipo', 'es');
    setCachedTranslation('Gospel Fellowship Night', 'Noche de comunión del evangelio', 'es');

    (useBoardListData as jest.Mock).mockReturnValue({
      loading: false,
      sections: [
        { title: 'This week', data: [mockDocs[0]] },
        { title: 'Earlier', data: [mockDocs[1]] },
      ],
      total: 2,
      names: { u1: 'Ana Smith', u2: 'Carlos Diaz' },
      error: null,
    });

    const { getByText } = render(
      <LanguageProvider defaultLanguage="es">
        <ThemeProvider>
          <BoardScreen />
        </ThemeProvider>
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(getByText('El Tablero')).toBeTruthy();
      expect(getByText('2 páginas')).toBeTruthy();
      expect(getByText('Lo que el equipo conversó y lo que surgió de ello. Abre una página para leerla.')).toBeTruthy();
      expect(getByText('Esta semana')).toBeTruthy();
      expect(getByText('Anteriores')).toBeTruthy();
      expect(getByText('Reunión del equipo')).toBeTruthy();
      expect(getByText('Noche de comunión del evangelio')).toBeTruthy();
      expect(getByText('Equipo')).toBeTruthy();
      expect(getByText('Abierto')).toBeTruthy();
      expect(getByText('Ana dirigiendo')).toBeTruthy();
      expect(getByText('Carlos dirigiendo')).toBeTruthy();
      expect(getByText('Las páginas se escriben y se mantienen en el sitio web de escritorio.')).toBeTruthy();
    });
  });

  it('renders empty state in Spanish when no sections exist', async () => {
    (useBoardListData as jest.Mock).mockReturnValue({
      loading: false,
      sections: [],
      total: 0,
      names: {},
      error: null,
    });

    const { getByText } = render(
      <LanguageProvider defaultLanguage="es">
        <ThemeProvider>
          <BoardScreen />
        </ThemeProvider>
      </LanguageProvider>,
    );

    expect(getByText('Sin páginas')).toBeTruthy();
    expect(getByText('No hay nada abierto para ti en este momento.')).toBeTruthy();
  });
});
