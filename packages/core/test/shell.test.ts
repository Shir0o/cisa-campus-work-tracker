import { describe, it, expect } from 'vitest';
import {
  FT_MORE,
  TRAINEE_DRAWER,
  allClearLine,
  isPushedScreen,
  queueMeta,
  shellForRole,
  tabsForRole,
  upNextLine,
} from '../src/shell';

describe('shellForRole', () => {
  it('gives the trainee the queue shell', () => {
    expect(shellForRole('manager')).toBe('queue');
  });

  it('gives both member roles the member shell', () => {
    expect(shellForRole('operator')).toBe('member');
    expect(shellForRole('viewer')).toBe('member');
  });

  it('falls through to the full-timer shell for admin and for no role', () => {
    expect(shellForRole('admin')).toBe('ft');
    expect(shellForRole(null)).toBe('ft');
    expect(shellForRole('something-new')).toBe('ft');
  });
});

describe('tabsForRole', () => {
  it('gives the trainee no tabs at all — the queue fills the screen', () => {
    expect(tabsForRole('manager')).toEqual([]);
  });

  it('gives the full-timer Today · People · Messages · More', () => {
    expect(tabsForRole('admin')).toEqual([
      { name: 'index', title: 'Today' },
      { name: 'people', title: 'People' },
      { name: 'messages', title: 'Messages' },
      { name: 'more', title: 'More' },
    ]);
  });

  it('gives a student Today · Prayer · Messages · You', () => {
    expect(tabsForRole('operator')).toEqual([
      { name: 'index', title: 'Today' },
      { name: 'prayer', title: 'Prayer' },
      { name: 'messages', title: 'Messages' },
      { name: 'more', title: 'You' },
    ]);
  });

  it("opens Community on What's on instead of Today", () => {
    expect(tabsForRole('viewer')[0]).toEqual({ name: 'index', title: "What's on" });
  });

  it('keeps the directory and the logging tab away from members', () => {
    for (const role of ['operator', 'viewer']) {
      const names = tabsForRole(role).map((t) => t.name);
      expect(names).not.toContain('people');
      expect(names).not.toContain('log');
      expect(names).not.toContain('journey');
    }
  });

  it('drops the prayer tab for both staff roles', () => {
    expect(tabsForRole('admin').map((t) => t.name)).not.toContain('prayer');
    expect(tabsForRole('manager').map((t) => t.name)).not.toContain('prayer');
  });
});

describe('isPushedScreen', () => {
  it('is true for a screen the role reaches by pushing', () => {
    // The trainee has no bar at all, so everything is pushed.
    expect(isPushedScreen('manager', 'people')).toBe(true);
    // The full-timer reaches The Journey through More.
    expect(isPushedScreen('admin', 'journey')).toBe(true);
  });

  it('is false for a screen the role has as a tab', () => {
    expect(isPushedScreen('admin', 'people')).toBe(false);
    expect(isPushedScreen('operator', 'prayer')).toBe(false);
  });
});

describe('the drawer and More lists', () => {
  it("matches the design's trainee drawer, in order", () => {
    expect(TRAINEE_DRAWER.map((l) => l.label)).toEqual([
      'People',
      'The Journey',
      'Gatherings',
      'The Board',
      'Messages',
      'Settings',
    ]);
  });

  it("matches the design's full-timer More, in order", () => {
    expect(FT_MORE.map((l) => l.label)).toEqual([
      'The Journey',
      'Gatherings',
      'Prayer log',
      'The Board',
      'Settings',
    ]);
  });

  it('never repeats a tab the full-timer already has', () => {
    const tabs = tabsForRole('admin').map((t) => t.name);
    expect(FT_MORE.every((l) => !tabs.includes(l.key))).toBe(true);
  });
});

describe('queueMeta', () => {
  it('counts the whole day, not just what is left', () => {
    expect(queueMeta(5, 3)).toEqual({ left: 'Today · 8 to look after', right: '4 of 8' });
  });

  it('starts at one of N before anything is handled', () => {
    expect(queueMeta(8, 0)).toEqual({ left: 'Today · 8 to look after', right: '1 of 8' });
  });

  it('does not run past the end once the last card is handled', () => {
    expect(queueMeta(0, 8).right).toBe('8 of 8');
  });

  it('says just "Today" when the day held nothing', () => {
    expect(queueMeta(0, 0)).toEqual({ left: 'Today', right: '' });
  });
});

describe('upNextLine', () => {
  it('names who is coming', () => {
    expect(upNextLine(['Ana', 'Rio'])).toBe('Then Ana, Rio');
  });

  it('counts the overflow past three', () => {
    expect(upNextLine(['Ana', 'Rio', 'Kofi', 'Lila', 'Mei'])).toBe('Then Ana, Rio, Kofi +2');
  });

  it('says so when this is the last one', () => {
    expect(upNextLine([])).toBe('Last one today');
  });
});

describe('allClearLine', () => {
  it('counts what was looked after', () => {
    expect(allClearLine(4)).toBe("4 things looked after today. That's the work.");
    expect(allClearLine(1)).toBe("1 thing looked after today. That's the work.");
  });

  it('has something else to say when the day was already empty', () => {
    expect(allClearLine(0)).toBe('Nothing is waiting on you right now. Enjoy the walk to class.');
  });
});
