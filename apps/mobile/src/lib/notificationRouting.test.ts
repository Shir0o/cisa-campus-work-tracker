import { routeForNotificationLink } from './notificationRouting';

// A bell entry's `link` is a web path; tapping its push on a phone must open
// the same thing in the native app.
describe('routeForNotificationLink', () => {
  it.each([
    // A top-level Conversation message opens the Conversation stream (#1303).
    ['/people/c1?tab=thread', '/contact/c1?tab=conversation'],
    // A top-level Full-timers message opens the Conversation on its side; only
    // a Full-timer actually sees that side.
    ['/people/c1?tab=discussion', '/contact/c1?tab=conversation&stream=team'],
    // A reply opens the Thread under its parent.
    ['/people/c1?tab=thread&parent=p1', '/contact/c1/thread?parent=p1'],
    ['/people/c1?tab=discussion&parent=p2', '/contact/c1/thread?parent=p2&stream=team'],
    // A message on an Interaction's Thread opens that Thread by its id.
    ['/people/c1?interaction=i9', '/contact/c1/thread?interaction=i9'],
    ['/people/c1', '/contact/c1'],
    // A chat reply opens the Thread under its parent.
    ['/messages/room-9?parent=m1', '/messages/room-9/thread?parent=m1'],
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
