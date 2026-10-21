import { campusRecent } from './campusRecent';

// Tuesday 20 Oct 2026, 1:30pm local — inside the default Tue/Wed 12pm–3pm window.
const NOW = new Date(2026, 9, 20, 13, 30).getTime();
const at = (h: number, m = 0) => new Date(2026, 9, 20, h, m).toISOString();
const window = { days: [2, 3], from: 12, to: 15 };

describe('campusRecent', () => {
  it('lists people I added since the window opened as new, newest first', () => {
    const contacts = [
      { id: 'a', name: 'Ana Ruiz', createdBy: 'me', createdAt: at(12, 10) },
      { id: 'b', name: 'Ben Ode', addedBy: 'me', createdAt: at(13, 5) },
    ];
    expect(campusRecent(contacts, [], 'me', window, NOW)).toEqual([
      { id: 'b', name: 'Ben', isNew: true },
      { id: 'a', name: 'Ana', isNew: true },
    ]);
  });

  it('leaves out people added before the window, or by someone else', () => {
    const contacts = [
      { id: 'a', name: 'Ana Ruiz', createdBy: 'me', createdAt: at(11, 50) },
      { id: 'b', name: 'Ben Ode', createdBy: 'other', createdAt: at(13, 0) },
    ];
    expect(campusRecent(contacts, [], 'me', window, NOW)).toEqual([]);
  });

  it('reads a Firestore Timestamp createdAt, as sign-ups store it', () => {
    const contacts = [{ id: 'a', name: 'Ana Ruiz', createdBy: 'me', createdAt: { toMillis: () => Date.parse(at(12, 30)) } }];
    expect(campusRecent(contacts as never, [], 'me', window, NOW)).toEqual([{ id: 'a', name: 'Ana', isNew: true }]);
  });

  it('lists people I logged a conversation with this window, once each', () => {
    const contacts = [{ id: 'c', name: 'Cam Diaz', createdBy: 'other', createdAt: at(9, 0) }];
    const interactions = [
      { id: 'i1', contactId: 'c', userId: 'me', content: '', dateTime: at(12, 20), createdAt: at(12, 20) },
      { id: 'i2', contactId: 'c', userId: 'me', content: '', dateTime: at(13, 0), createdAt: at(13, 0) },
      { id: 'i3', contactId: 'c', userId: 'other', content: '', dateTime: at(13, 10), createdAt: at(13, 10) },
      { id: 'i4', contactId: 'c', userId: 'me', content: '', dateTime: at(10, 0), createdAt: at(10, 0) },
    ];
    expect(campusRecent(contacts, interactions, 'me', window, NOW)).toEqual([{ id: 'c', name: 'Cam', isNew: false }]);
  });

  it('shows someone I added and then logged once, as new', () => {
    const contacts = [{ id: 'a', name: 'Ana Ruiz', createdBy: 'me', createdAt: at(12, 10) }];
    const interactions = [{ id: 'i1', contactId: 'a', userId: 'me', content: '', dateTime: at(12, 15), createdAt: at(12, 15) }];
    expect(campusRecent(contacts, interactions, 'me', window, NOW)).toEqual([{ id: 'a', name: 'Ana', isNew: true }]);
  });
});
