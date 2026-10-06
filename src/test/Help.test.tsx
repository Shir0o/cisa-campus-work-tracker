import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const roleState = vi.hoisted(() => ({ role: 'viewer' as string }));
const langState = vi.hoisted(() => ({ language: 'en' as string }));

vi.mock('../components/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ role: roleState.role, effectiveUserId: null }),
}));

vi.mock('../components/LanguageProvider', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLanguage: () => ({
    language: langState.language,
    isSpanish: langState.language === 'es',
    setLanguage: vi.fn(),
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('../generated/help.json', () => ({
  default: {
    pages: [
      {
        slug: 'getting-started',
        order: 1,
        category: 'Basics',
        content: {
          en: {
            title: 'Getting Started',
            body: [
              '# Getting Started',
              '',
              'Hello **world** and a [link](https://example.com).',
              '',
              '## Section',
              '',
              '- one',
              '- two',
              '',
              '1. first',
              '2. second',
              '',
              '### Sub',
              '',
              '> quote',
              '',
              '`code`',
            ].join('\n'),
          },
          es: { title: 'Empezar', body: '# Empezar\n\nHola **mundo**.' },
        },
      },
      {
        slug: 'admin-console',
        order: 2,
        category: 'Staff',
        audience: ['admin'],
        content: {
          en: { title: 'Admin Console', body: 'Admins only' },
          es: { title: 'Consola', body: 'Solo administradores' },
        },
      },
      {
        slug: 'english-only',
        order: 3,
        content: {
          en: { title: 'English Only', body: 'No translation yet' },
        },
      },
    ],
  },
}));

import Help from '../views/Help';

function renderHelp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/help" element={<Help />} />
        <Route path="/help/:slug" element={<Help />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Help view', () => {
  beforeEach(() => {
    roleState.role = 'viewer';
    langState.language = 'en';
  });

  it('lists only the pages a role may see', () => {
    renderHelp('/help');
    expect(screen.getByRole('link', { name: /Getting Started/i })).toHaveAttribute(
      'href',
      '/help/getting-started',
    );
    expect(screen.getByRole('link', { name: /English Only/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Admin Console/i })).not.toBeInTheDocument();
  });

  it('shows an audience page to a role that is listed', () => {
    roleState.role = 'admin';
    renderHelp('/help');
    expect(screen.getByRole('link', { name: /Admin Console/i })).toHaveAttribute(
      'href',
      '/help/admin-console',
    );
  });

  it('resolves a hidden page as not-found on a direct route', () => {
    renderHelp('/help/admin-console');
    expect(screen.getByTestId('help-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('help-page')).not.toBeInTheDocument();
  });

  it('resolves an unknown slug as not-found', () => {
    renderHelp('/help/does-not-exist');
    expect(screen.getByTestId('help-not-found')).toBeInTheDocument();
  });

  it('renders the markdown body through the shared renderer', () => {
    renderHelp('/help/getting-started');
    expect(screen.getByRole('heading', { name: 'Getting Started' })).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('renders authored Spanish content', () => {
    langState.language = 'es';
    renderHelp('/help/getting-started');
    expect(screen.getByRole('heading', { name: 'Empezar' })).toBeInTheDocument();
    expect(screen.getByText('mundo')).toBeInTheDocument();
  });

  it('falls back to English when a page has no translation', () => {
    langState.language = 'es';
    renderHelp('/help/english-only');
    expect(screen.getByRole('link', { name: 'English Only' })).toBeInTheDocument();
    expect(screen.getByText('No translation yet')).toBeInTheDocument();
  });
});
