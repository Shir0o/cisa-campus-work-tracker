import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

jest.mock('../../lib/firebase', () => ({
  auth: { currentUser: null },
}));

jest.mock('../../lib/useMessagesData', () => ({
  useMessagesData: () => ({ unreadCount: 0 }),
}));

import { ThemeProvider } from '../../theme/ThemeProvider';
import { LanguageProvider } from '../../lib/LanguageProvider';
import { V2TabBar, getMobileTabTitle } from '../../../app/(tabs)/_layout';
import { tabsForRole } from '@cisa/core';

describe('V2TabBar and Tab Navigation', () => {
  describe('getMobileTabTitle (P0 Tab Labels & i18n)', () => {
    it('returns "You" for student role on the more route in English and "Tú" in Spanish', () => {
      const studentTabs = tabsForRole('operator');
      expect(getMobileTabTitle(studentTabs, 'more', 'en')).toBe('You');
      expect(getMobileTabTitle(studentTabs, 'more', 'es')).toBe('Tú');
    });

    it('returns "What\'s on" for community role on index route in English and "Qué hay" in Spanish', () => {
      const communityTabs = tabsForRole('viewer');
      expect(getMobileTabTitle(communityTabs, 'index', 'en')).toBe("What's on");
      expect(getMobileTabTitle(communityTabs, 'index', 'es')).toBe('Qué hay');
    });

    it('returns "More" for full-timer role on the more route in English and "Más" in Spanish', () => {
      const ftTabs = tabsForRole('admin');
      expect(getMobileTabTitle(ftTabs, 'more', 'en')).toBe('More');
      expect(getMobileTabTitle(ftTabs, 'more', 'es')).toBe('Más');
    });

    it('returns "Today" for full-timer role on index route in English and "Hoy" in Spanish', () => {
      const ftTabs = tabsForRole('admin');
      expect(getMobileTabTitle(ftTabs, 'index', 'en')).toBe('Today');
      expect(getMobileTabTitle(ftTabs, 'index', 'es')).toBe('Hoy');
    });
  });

  describe('V2TabBar visual styling and accessibility', () => {
    const mockNavigation: any = {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    };

    const createProps = (focusedIndex = 0, unreadBadge?: number) => ({
      state: {
        index: focusedIndex,
        routes: [
          { key: 'today-key', name: 'index' },
          { key: 'messages-key', name: 'messages' },
          { key: 'more-key', name: 'more' },
        ],
      } as any,
      descriptors: {
        'today-key': { options: { title: 'Today' } },
        'messages-key': { options: { title: 'Messages', tabBarBadge: unreadBadge } },
        'more-key': { options: { title: 'You' } },
      } as any,
      navigation: mockNavigation,
      insets: { top: 0, bottom: 20, left: 0, right: 0 },
      tabNames: ['index', 'messages', 'more'],
    });

    it('renders container with accessibilityRole="tablist"', async () => {
      const props = createProps(0);
      const { getByTestId } = await render(
        <ThemeProvider>
          <LanguageProvider>
            <V2TabBar {...props} />
          </LanguageProvider>
        </ThemeProvider>,
      );

      const tablist = getByTestId('tab-bar-container');
      expect(tablist.props.accessibilityRole).toBe('tablist');
    });

    it('renders tabs with strict ink inversion on active tab and high-contrast ink on inactive tabs', async () => {
      const props = createProps(0);
      const { getAllByRole, getByText } = await render(
        <ThemeProvider>
          <LanguageProvider>
            <V2TabBar {...props} />
          </LanguageProvider>
        </ThemeProvider>,
      );

      const tabs = getAllByRole('tab');
      expect(tabs).toHaveLength(3);

      // Active tab (Today) - solid dark ink inversion
      const activeTab = tabs[0];
      const activeText = getByText('Today');
      // In light mode, inverse background is #1A212B and text is #F6F8FB
      expect(activeTab.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backgroundColor: '#1A212B' }),
        ]),
      );
      expect(activeText.props.style).toEqual(
        expect.objectContaining({ color: '#F6F8FB' }),
      );

      // Inactive tab (You) - c.room.ink2 (#525E6F) for WCAG AA (6.19:1)
      const inactiveText = getByText('You');
      expect(inactiveText.props.style).toEqual(
        expect.objectContaining({ color: '#525E6F' }),
      );
    });

    it('enforces 48dp minHeight and 16px borderRadius for touch targets', async () => {
      const props = createProps(0);
      const { getAllByRole } = await render(
        <ThemeProvider>
          <LanguageProvider>
            <V2TabBar {...props} />
          </LanguageProvider>
        </ThemeProvider>,
      );

      const tabs = getAllByRole('tab');
      tabs.forEach((tab) => {
        expect(tab.props.style).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ minHeight: 48, borderRadius: 16 }),
          ]),
        );
      });
    });

    it('localizes accessibilityLabel with unread counts in English and Spanish', async () => {
      const props = createProps(0, 3);
      const enRender = await render(
        <ThemeProvider>
          <LanguageProvider defaultLanguage="en">
            <V2TabBar {...props} />
          </LanguageProvider>
        </ThemeProvider>,
      );

      expect(enRender.getByLabelText('Messages, 3 unread')).toBeTruthy();

      const esRender = await render(
        <ThemeProvider>
          <LanguageProvider defaultLanguage="es">
            <V2TabBar {...props} />
          </LanguageProvider>
        </ThemeProvider>,
      );

      expect(esRender.getByLabelText('Messages, 3 sin leer')).toBeTruthy();
    });
  });
});
