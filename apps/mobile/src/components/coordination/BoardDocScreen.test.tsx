import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { LanguageProvider } from '../../lib/LanguageProvider';
import { BoardDocScreen } from './BoardDocScreen';
import { useBoardDocData } from '../../lib/useBoardDocData';
import { clearTranslationCache } from '../../lib/translator';
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

describe('BoardDocScreen', () => {
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

    const { getByText } = await render(
      <LanguageProvider>
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
});
