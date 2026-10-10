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

  it('embeds the What\'s New Video iframe when the release carries a Google Drive video_url', () => {
    const withVideo: WhatsNewManifest = {
      latestReleaseId: '2026-09-17-v1.6.0',
      releases: [
        {
          id: '2026-09-17-v1.6.0',
          version: '1.6.0',
          title: 'With Video',
          date: '2026-09-17',
          platforms: ['web', 'mobile'],
          video_url: 'https://drive.google.com/file/d/1a2b3c4d5e/view?usp=sharing',
          items: [{ text: 'A change', platforms: ['web', 'mobile'] }],
        },
      ],
    };

    render(
      <WhatsNewModal
        manifest={withVideo}
        platform="web"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const iframe = screen.getByTitle(/what's new video/i) as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toBe('https://drive.google.com/file/d/1a2b3c4d5e/preview');

    const fallbackLink = screen.getByRole('link', { name: /open video in google drive/i });
    expect(fallbackLink).toBeInTheDocument();
    expect(fallbackLink).toHaveAttribute('href', 'https://drive.google.com/file/d/1a2b3c4d5e/view?usp=sharing');
    expect(fallbackLink).toHaveAttribute('target', '_blank');
  });

  it('renders no video when the release has no video_url', () => {
    render(
      <WhatsNewModal
        manifest={sampleManifest}
        platform="web"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByTitle(/what's new video/i)).not.toBeInTheDocument();
  });

  it('prefers videoUrlOverride prop over release video_url', () => {
    const withVideo: WhatsNewManifest = {
      latestReleaseId: '2026-09-17-v1.6.0',
      releases: [
        {
          id: '2026-09-17-v1.6.0',
          version: '1.6.0',
          title: 'With Video',
          date: '2026-09-17',
          platforms: ['web'],
          video_url: 'https://drive.google.com/file/d/manifestId/view',
          items: [{ text: 'Change', platforms: ['web'] }],
        },
      ],
    };

    render(
      <WhatsNewModal
        manifest={withVideo}
        platform="web"
        isOpen={true}
        onClose={vi.fn()}
        videoUrlOverride="https://drive.google.com/file/d/overrideId/view"
      />
    );

    const iframe = screen.getByTitle(/what's new video/i) as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toBe('https://drive.google.com/file/d/overrideId/preview');

    const fallbackLink = screen.getByRole('link', { name: /open video in google drive/i });
    expect(fallbackLink).toHaveAttribute('href', 'https://drive.google.com/file/d/overrideId/view');
  });

  it('uses videoUrlOverride when release has no video_url', () => {
    render(
      <WhatsNewModal
        manifest={sampleManifest}
        platform="web"
        isOpen={true}
        onClose={vi.fn()}
        videoUrlOverride="https://drive.google.com/file/d/customId/view"
      />
    );

    const iframe = screen.getByTitle(/what's new video/i) as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toBe('https://drive.google.com/file/d/customId/preview');
  });

  it('hides video when user role is not permitted by videoRolesOverride or video_roles', () => {
    const withVideo: WhatsNewManifest = {
      latestReleaseId: '2026-09-17-v1.6.0',
      releases: [
        {
          id: '2026-09-17-v1.6.0',
          version: '1.6.0',
          title: 'Full-timer Only Feature',
          date: '2026-09-17',
          platforms: ['web'],
          video_url: 'https://drive.google.com/file/d/ftVideo/view',
          video_roles: ['admin'],
          items: [{ text: 'Admin secret', platforms: ['web'] }],
        },
      ],
    };

    // User is trainee ('manager') -> should NOT see video
    const { unmount } = render(
      <WhatsNewModal
        manifest={withVideo}
        platform="web"
        isOpen={true}
        onClose={vi.fn()}
        currentRole="manager"
      />
    );
    expect(screen.queryByTitle(/what's new video/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open video in google drive/i })).not.toBeInTheDocument();
    unmount();

    // User is admin ('admin') -> should see video
    render(
      <WhatsNewModal
        manifest={withVideo}
        platform="web"
        isOpen={true}
        onClose={vi.fn()}
        currentRole="admin"
      />
    );
    expect(screen.getByTitle(/what's new video/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open video in google drive/i })).toBeInTheDocument();
  });

  it('respects dynamic videoRolesOverride over static video_roles', () => {
    const withVideo: WhatsNewManifest = {
      latestReleaseId: '2026-09-17-v1.6.0',
      releases: [
        {
          id: '2026-09-17-v1.6.0',
          version: '1.6.0',
          title: 'Dynamic Roles Feature',
          date: '2026-09-17',
          platforms: ['web'],
          video_url: 'https://drive.google.com/file/d/dynVideo/view',
          video_roles: ['admin'],
          items: [{ text: 'Info', platforms: ['web'] }],
        },
      ],
    };

    // Admin loosened permissions in Settings to allow ['admin', 'manager']
    render(
      <WhatsNewModal
        manifest={withVideo}
        platform="web"
        isOpen={true}
        onClose={vi.fn()}
        currentRole="manager"
        videoRolesOverride={['admin', 'manager']}
      />
    );
    expect(screen.getByTitle(/what's new video/i)).toBeInTheDocument();
  });


  it('renders through the shared popup frame, labelled with its title (#1456)', () => {
    render(<WhatsNewModal manifest={sampleManifest} platform="web" isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: "What's New in v1.4.0" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
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
