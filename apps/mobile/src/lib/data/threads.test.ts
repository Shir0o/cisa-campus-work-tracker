// Where a bell entry about a written contact message sends the phone (#1303).
import { threadNotificationLink } from './threads';

jest.mock('@cisa/core', () => ({}));
jest.mock('../firebase', () => ({
  db: {},
  handleFirestoreError: jest.fn(),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  sendNotification: jest.fn(),
}));

describe('threadNotificationLink', () => {
  it('a top-level Conversation message opens just the stream', () => {
    expect(threadNotificationLink('c1', {})).toBe('/people/c1?tab=thread');
  });

  it('a Conversation reply opens the Thread under its parent', () => {
    expect(threadNotificationLink('c1', { parentId: 'p1' })).toBe('/people/c1?tab=thread&parent=p1');
  });

  it('a Full-timers message opens the Discussion side, a reply under its parent', () => {
    expect(threadNotificationLink('c1', { scope: 'team' })).toBe('/people/c1?tab=discussion');
    expect(threadNotificationLink('c1', { scope: 'team', parentId: 'p2' })).toBe(
      '/people/c1?tab=discussion&parent=p2',
    );
  });

  it("a message on an Interaction's Thread carries the interaction id", () => {
    expect(threadNotificationLink('c1', { interactionId: 'i9', parentId: 'p3' })).toBe(
      '/people/c1?interaction=i9',
    );
  });
});
