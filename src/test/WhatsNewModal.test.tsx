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
    const { rerender } = render(
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
});
