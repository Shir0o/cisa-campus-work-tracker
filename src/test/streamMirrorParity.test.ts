// Mirror parity (ADR 0033 §6): the web app's stream model (src/lib/stream.ts)
// and the shared core one (packages/core/src/stream.ts) must lay out the same
// messages identically, or a Conversation reads differently on the web and the
// phone. The web app deliberately has no @cisa/core dependency, so the two
// copies cannot share an import; this corpus is the contract between them
// (the same shape as feedVisibleThreadsMirrorParity.test.ts).
import { describe, it, expect } from 'vitest';
import { buildStream as webStream, buildThread as webThread, calendarDaysOpen as webDaysOpen, type StreamMessage } from '../lib/stream';
// Direct relative import into the workspace package -- resolved for tests only.
import { buildStream as coreStream, buildThread as coreThread, calendarDaysOpen as coreDaysOpen } from '../../packages/core/src/stream';

const at = (d: number, h: number, m = 0, s = 0) => new Date(2026, 8, d, h, m, s).toISOString();
const NOW = new Date(2026, 8, 24, 12, 0).getTime();

const base = { parentId: null, fromName: '', kind: 'comment', body: '…' };
const CORPUS: StreamMessage[][] = [
  [],
  // The Main.dc.html Conversation: grouping, a replied parent, an open ask, a question.
  [
    { ...base, id: 'm1', from: 'maria', fromName: 'Maria Santos', at: at(22, 10, 14) },
    { ...base, id: 'm2', from: 'maria', fromName: 'Maria Santos', at: at(22, 10, 16) },
    { ...base, id: 'j1', from: 'josh', fromName: 'Josh Park', at: at(22, 11, 2) },
    { ...base, id: 'r1', parentId: 'j1', from: 'maria', fromName: 'Maria Santos', at: at(22, 11, 20) },
    { ...base, id: 'r2', parentId: 'j1', from: 'grace', fromName: 'Grace Liu', at: at(23, 8) },
    { ...base, id: 'ask', kind: 'nudge', from: 'maria', fromName: 'Maria Santos', at: at(23, 16, 40) },
    { ...base, id: 'q', kind: 'question', from: 'grace', fromName: 'Grace Liu', at: at(24, 9, 12) },
  ],
  // Boundaries: exactly 5 minutes, a second past, midnight, closed and withdrawn asks.
  [
    { ...base, id: 'a', from: 'u1', at: at(23, 23, 58) },
    { ...base, id: 'b', from: 'u1', at: at(24, 0, 1) },
    { ...base, id: 'c', from: 'u1', at: at(24, 0, 6) },
    { ...base, id: 'd', from: 'u1', at: at(24, 0, 11, 1) },
    { ...base, id: 'done', kind: 'nudge', from: 'u2', at: at(20, 9), closedBy: 'u1', closedByName: 'Amy', closedAt: at(21, 9) },
    { ...base, id: 'gone', kind: 'nudge', from: 'u2', at: at(20, 10), closedBy: 'u2', closedByName: 'Ben', closedAt: at(20, 11) },
    { ...base, id: 'kindless', kind: undefined, from: 'u3', at: at(24, 11) },
  ],
  // More than three repliers, and a duplicate among them, handed in newest first.
  [
    { ...base, id: 'r5', parentId: 'p', from: 'e', at: at(24, 10, 5) },
    { ...base, id: 'r4', parentId: 'p', from: 'a', at: at(24, 10, 4) },
    { ...base, id: 'r3', parentId: 'p', from: 'c', at: at(24, 10, 3) },
    { ...base, id: 'r2', parentId: 'p', from: 'b', at: at(24, 10, 2) },
    { ...base, id: 'r1', parentId: 'p', from: 'a', at: at(24, 10, 1) },
    { ...base, id: 'p', from: 'u1', at: at(24, 10) },
  ],
];

const VIEWERS = [
  { uid: 'maria', role: 'manager' },
  { uid: 'ruth', role: 'admin' },
  { uid: 'u2', role: 'manager' },
  { uid: 'vic', role: 'viewer' },
  { uid: 'nobody', role: null },
];
const READ_POINTS = [undefined, null, at(20, 0), at(22, 11), at(24, 23)];

describe('stream model mirror parity (ADR 0033)', () => {
  it('web and core lay out every corpus stream the same, for every viewer and read point', () => {
    let cases = 0;
    for (const messages of CORPUS) {
      for (const viewer of VIEWERS) {
        for (const lastReadAt of READ_POINTS) {
          const input = { messages, viewer, now: NOW, lastReadAt };
          expect(webStream(input)).toEqual(coreStream(input));
          for (const m of messages) {
            expect(webThread(input, m.id)).toEqual(coreThread(input, m.id));
          }
          cases += 1;
        }
      }
    }
    expect(cases).toBe(CORPUS.length * VIEWERS.length * READ_POINTS.length);
  });

  it('the corpus exercises what the model decides, so agreement means something', () => {
    const items = webStream({ messages: CORPUS[1], viewer: VIEWERS[0], now: NOW, lastReadAt: at(22, 11) });
    expect(items.map((i) => (i.type === 'row' ? `${i.message.id}${i.continuation ? '+' : ''}` : i.type))).toEqual([
      'day', 'm1', 'm2+', 'new', 'j1', 'day', 'ask', 'day', 'q',
    ]);
  });

  it('calendarDaysOpen agrees across the two copies, including 20 hours ago on the previous day', () => {
    const todayTwentyHoursAgo = new Date(2026, 8, 24, 8, 0).toISOString();
    const yesterdayTwentyHoursAgo = new Date(2026, 8, 23, 16, 0).toISOString();
    const cases = [todayTwentyHoursAgo, yesterdayTwentyHoursAgo, at(20, 9), at(24, 12)];
    for (const iso of cases) {
      expect(coreDaysOpen(iso, NOW)).toBe(webDaysOpen(iso, NOW));
    }
    expect(webDaysOpen(yesterdayTwentyHoursAgo, NOW)).toBe(1);
    expect(webDaysOpen(todayTwentyHoursAgo, NOW)).toBe(0);
  });
});
