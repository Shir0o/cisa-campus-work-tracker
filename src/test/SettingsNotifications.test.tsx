import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../views/Settings';
import * as webPush from '../lib/webPush';
import * as pushLib from '../lib/push';

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u-123', email: 'tester@cisa.test', displayName: 'Tester' },
    role: 'admin',
    isAdmin: true,
    isManager: true,
    isOperator: true,
    isViewer: true,
    isApproved: true,
    loading: false,
    logOut: vi.fn(),
  }),
}));

vi.mock('../components/NavShellProvider', () => ({
  useNavShell: () => ({ preference: 'rail', effective: 'rail', setPreference: vi.fn() }),
  NavShellProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}));

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), isSpanish: false, t: (_k: string, fb?: string) => fb ?? _k }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' },
}));

describe('Settings Notifications Section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders notification status and send test notification button', () => {
    vi.spyOn(webPush, 'getWebNotificationPermissionStatus').mockReturnValue('granted');

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Notifications & Alerts').length).toBeGreaterThan(0);
    expect(screen.getByText('Browser notifications are enabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send test notification/i })).toBeInTheDocument();
  });

  it('handles clicking Send test notification button', async () => {
    vi.spyOn(webPush, 'getWebNotificationPermissionStatus').mockReturnValue('granted');
    const registerSwSpy = vi.spyOn(webPush, 'registerServiceWorker').mockResolvedValue(null);
    const showPushSpy = vi.spyOn(webPush, 'showWebPushNotification').mockResolvedValue(true);
    const sendPushSpy = vi.spyOn(pushLib, 'sendPushNotification').mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    const testBtn = screen.getByRole('button', { name: /Send test notification/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(registerSwSpy).toHaveBeenCalled();
      expect(showPushSpy).toHaveBeenCalledWith('Test Notification', expect.any(Object));
      expect(sendPushSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u-123',
          title: 'Test Notification',
        }),
      );
    });

    expect(await screen.findByText('Test notification sent! Check your notification area.')).toBeInTheDocument();
  });
});
