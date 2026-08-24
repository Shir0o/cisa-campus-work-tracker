import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { LanguageProvider } from '../../lib/LanguageProvider';
import { BoardDocScreen } from './BoardDocScreen';
import { useBoardDocData } from '../../lib/useBoardDocData';
import { setCachedTranslation, clearTranslationCache } from '../../lib/translator';
import type { BoardDoc } from '@cisa/core';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'admin' }),
}));

jest.mock('../../lib/useBoardDocData', () => ({ useBoardDocData: jest.fn() }));
jest.mock('../../lib/useBoardListData', () => ({
  useBoardListData: jest.fn(),
  boardLeaderName: jest.fn(),
}));

jest.mock('react-native-marked', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    useMarkdown: (md: string) =>
      (md || '')
        .split('\n')
        .filter(Boolean)
        .map((line: string, idx: number) =>
          React.createElement(
            Text,
            { key: `md_${idx}` },
            line.replace(/^[_#\-\s*\[\]]+|[_#\-\s*\[\]]+$/g, '').trim(),
          ),
        ),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

describe('BoardDocScreen Spanish Translation', () => {
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

  it('renders doc markdown and title in English by default', async () => {
    const mockDoc: BoardDoc = {
      id: 'doc-1',
      date: '',
      title: 'Monday Strategy',
      md: '# Weekly Focus\n- [ ] Meet with freshmen',
      audience: 'team',
    };

    (useBoardDocData as jest.Mock).mockReturnValue({
      loading: false,
      doc: mockDoc,
      allowed: true,
      error: null,
      keeperName: 'Ana Smith',
    });

    const { getByText } = render(
      <LanguageProvider defaultLanguage="en">
        <ThemeProvider>
          <BoardDocScreen docId="doc-1" />
        </ThemeProvider>
      </LanguageProvider>,
    );

    expect(getByText('Monday Strategy')).toBeTruthy();
    expect(getByText('Weekly Focus')).toBeTruthy();
    expect(getByText('Meet with freshmen')).toBeTruthy();
    expect(getByText('Full-timers')).toBeTruthy();
    expect(getByText("Ana keeps this page. Writing happens on the desktop site — here you're reading.")).toBeTruthy();
  });

  it('renders translated markdown content and title in Spanish', async () => {
    const mockDoc: BoardDoc = {
      id: 'doc-2',
      date: '',
      title: 'Campus Outreach Review',
      md: '# Enfoque Semanal\n- [ ] Hablar con los estudiantes',
      audience: 'trainees',
    };

    setCachedTranslation('Campus Outreach Review', 'Revisión de alcance en el campus', 'es');
    setCachedTranslation(mockDoc.md, '# Enfoque Semanal Traducido\n- [ ] Hablar con los estudiantes', 'es');

    (useBoardDocData as jest.Mock).mockReturnValue({
      loading: false,
      doc: mockDoc,
      allowed: true,
      error: null,
      keeperName: 'Carlos Doe',
    });

    const { getByText } = render(
      <LanguageProvider defaultLanguage="es">
        <ThemeProvider>
          <BoardDocScreen docId="doc-2" />
        </ThemeProvider>
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(getByText('Revisión de alcance en el campus')).toBeTruthy();
      expect(getByText('Enfoque Semanal Traducido')).toBeTruthy();
      expect(getByText('Hablar con los estudiantes')).toBeTruthy();
      expect(getByText('Personal y capacitandos')).toBeTruthy();
      expect(getByText('Carlos mantiene esta página. La escritura se realiza en el sitio web de escritorio; aquí estás leyendo.')).toBeTruthy();
    });
  });

  it('renders team keeper footer and empty page fallback in Spanish', async () => {
    const mockDoc: BoardDoc = {
      id: 'doc-3',
      date: '2026-08-24',
      title: 'General Gathering',
      md: '',
      audience: 'everyone',
    };

    (useBoardDocData as jest.Mock).mockReturnValue({
      loading: false,
      doc: mockDoc,
      allowed: true,
      error: null,
      keeperName: null,
    });

    const { getByText } = render(
      <LanguageProvider defaultLanguage="es">
        <ThemeProvider>
          <BoardDocScreen docId="doc-3" />
        </ThemeProvider>
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(getByText('Esta página está vacía.')).toBeTruthy();
      expect(getByText('Cualquiera en CISA')).toBeTruthy();
      expect(getByText('El equipo mantiene esta página. La escritura se realiza en el sitio web de escritorio; aquí estás leyendo.')).toBeTruthy();
    });
  });

  it('renders not found and not allowed error states in Spanish', async () => {
    (useBoardDocData as jest.Mock).mockReturnValue({
      loading: false,
      doc: null,
      allowed: true,
      error: null,
      keeperName: null,
    });

    const { getByText, rerender } = render(
      <LanguageProvider defaultLanguage="es">
        <ThemeProvider>
          <BoardDocScreen docId="missing" />
        </ThemeProvider>
      </LanguageProvider>,
    );

    expect(getByText('No se pudo encontrar esta página.')).toBeTruthy();

    (useBoardDocData as jest.Mock).mockReturnValue({
      loading: false,
      doc: {
        id: 'doc-locked',
        date: '2026-08-24',
        title: 'Admin Only',
        md: '',
        audience: 'team',
      },
      allowed: false,
      error: null,
      keeperName: null,
    });

    rerender(
      <LanguageProvider defaultLanguage="es">
        <ThemeProvider>
          <BoardDocScreen docId="locked" />
        </ThemeProvider>
      </LanguageProvider>,
    );

    expect(getByText('Esta página no está abierta para tu rol.')).toBeTruthy();
  });
});
