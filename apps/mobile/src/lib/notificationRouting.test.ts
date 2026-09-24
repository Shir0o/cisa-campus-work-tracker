import { routeForNotificationLink } from './notificationRouting';

// A bell entry's `link` is a web path; tapping its push on a phone must open
// the same thing in the native app.
describe('routeForNotificationLink', () => {
  it.each([
    ['/people/c1?tab=thread', '/contact/c1'],
    ['/people/c1?tab=discussion', '/contact/c1'],
    ['/people/c1', '/contact/c1'],
    ['/messages/room-9', '/messages/room-9'],
    ['/messages', '/messages'],
    ['/directory', '/people'],
    ['/feedback', '/your-notes'],
    ['/coordination/doc-2', '/coordination/doc-2'],
  ])('%s opens %s', (link, route) => {
    expect(routeForNotificationLink(link)).toBe(route);
  });

  it.each([[undefined], [null], [''], ['/questions'], ['/settings'], [42]])(
    'anything else (%s) opens the app home',
    (link) => {
      expect(routeForNotificationLink(link)).toBe('/');
    },
  );
});
