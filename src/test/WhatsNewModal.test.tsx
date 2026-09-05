import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WhatsNewModal from '../components/WhatsNewModal';
import type { WhatsNewManifest } from '../scripts/compile-whats-new';
import { WHATS_NEW_STORAGE_KEY } from '../lib/whatsNew';

describe('WhatsNewModal', () => {
  const sampleManifest: WhatsNewManifest = {
    latestReleaseId: '2026-09-03-v1.4.0',
    releases: [
      {
        id: '2026-09-03-v1.4.0',
        version: '1.4.0',
        title: 'September Release',
        date: '2026-09-03',
        platforms: ['web', 'mobile'],
        overview: 'Welcome to the latest version!',
        items: [
          { text: 'Fast keyboard search with ⌘K', platforms: ['web'] },
          { text: 'Mobile gestures', platforms: ['mobile'] },
          { text: 'New prayer view', platforms: ['web', 'mobile'] },
        ],
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('renders automatically if unseen and marks seen when dismissed', () => {
    const onClose = vi.fn();
    render(
      <WhatsNewModal
        manifest={sampleManifest}
        platform="web"
        isOpen={true}
        onClose={onClose}
      />
    );

    expect(screen.getByText("What's New in v1.4.0")).toBeInTheDocument();
    expect(screen.getByText('September Release')).toBeInTheDocument();
    expect(screen.getByText('Fast keyboard search with ⌘K')).toBeInTheDocument();
    expect(screen.getByText('New prayer view')).toBeInTheDocument();
    // Mobile-only item should not be rendered on web
    expect(screen.queryByText('Mobile gestures')).not.toBeInTheDocument();

    const gotItBtn = screen.getByRole('button', { name: /got it/i });
    fireEvent.click(gotItBtn);

    expect(localStorage.getItem(WHATS_NEW_STORAGE_KEY)).toBe('2026-09-03-v1.4.0');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders categorized items in order (New Features, UI/UX Updates, Bug Fixes) with badges', () => {
    const categorizedManifest: WhatsNewManifest = {
      latestReleaseId: '2026-09-04-v1.4.1',
      releases: [
        {
          id: '2026-09-04-v1.4.1',
          version: '1.4.1',
          title: 'September Platform & Mobile Updates',
          date: '2026-09-04',
          platforms: ['web', 'mobile'],
          overview: 'New features and improvements!',
          items: [
            { text: 'Resolved login crash', platforms: ['web'], category: 'fix' },
            { text: 'Redesigned sidebar navigation', platforms: ['web'], category: 'ui' },
            { text: 'Added offline export capabilities', platforms: ['web'], category: 'feature' },
          ],
        },
      ],
    };

    render(
      <WhatsNewModal
        manifest={categorizedManifest}
        platform="web"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Verify category headings / badges
    expect(screen.getByText('New Features')).toBeInTheDocument();
    expect(screen.getByText('UI/UX Updates')).toBeInTheDocument();
    expect(screen.getByText('Bug Fixes')).toBeInTheDocument();

    // Verify ordering in DOM: New Features must appear before UI/UX Updates, which appears before Bug Fixes
    const featureEl = screen.getByText('Added offline export capabilities');
    const uiEl = screen.getByText('Redesigned sidebar navigation');
    const fixEl = screen.getByText('Resolved login crash');

    expect(featureEl.compareDocumentPosition(uiEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(uiEl.compareDocumentPosition(fixEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
