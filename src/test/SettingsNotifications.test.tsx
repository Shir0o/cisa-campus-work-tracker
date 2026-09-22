import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../views/Settings';
import * as webPush from '../lib/webPush';
import { sendNotification } from '../lib/firebase';

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
  sendNotification: vi.fn().mockResolvedValue(undefined),
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  doc: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  orderBy: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(),
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

  it('sends the test through the real pipeline: a bell entry to yourself, pushed to every device', async () => {
    vi.spyOn(webPush, 'getWebNotificationPermissionStatus').mockReturnValue('granted');
    const registerSpy = vi.spyOn(webPush, 'registerWebPush').mockResolvedValue(true);

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Send test notification/i }));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith('u-123');
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u-123', title: 'Test Notification', type: 'info' }),
      );
    });
    expect(
      await screen.findByText('Test sent — it should arrive on every device where notifications are on.'),
    ).toBeInTheDocument();
  });

  it('says so when this browser cannot receive push, but still tests your other devices', async () => {
    vi.spyOn(webPush, 'getWebNotificationPermissionStatus').mockReturnValue('granted');
    vi.spyOn(webPush, 'registerWebPush').mockResolvedValue(false);

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Send test notification/i }));

    expect(
      await screen.findByText(
        "This browser can't receive push alerts (on iPhone, add the app to your Home Screen first). The test was sent to your other devices.",
      ),
    ).toBeInTheDocument();
    expect(sendNotification).toHaveBeenCalled();
  });

  it('registers this browser the moment notifications are enabled', async () => {
    vi.spyOn(webPush, 'getWebNotificationPermissionStatus').mockReturnValue('default');
    vi.spyOn(webPush, 'requestWebNotificationPermission').mockResolvedValue(true);
    const registerSpy = vi.spyOn(webPush, 'registerWebPush').mockResolvedValue(true);

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Enable/i }));
    await waitFor(() => expect(registerSpy).toHaveBeenCalledWith('u-123'));
  });
});
