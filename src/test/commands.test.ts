import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  registerCommand,
  useCommand,
  subscribeCommands,
  getCommands,
  shortcutLabel,
  type Command,
} from '../lib/commands';

const fire = (init: KeyboardEventInit) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));

const make = (over: Partial<Command> = {}): Command => ({
  id: 'cmd.test',
  scope: 'global',
  description: 'Test command',
  shortcut: { key: 'k', mod: true },
  handler: vi.fn(),
  ...over,
});

describe('shortcutLabel', () => {
  it('renders ⌘K for a mod shortcut', () => {
    expect(shortcutLabel({ key: 'k', mod: true })).toBe('⌘K');
  });

  it('renders ⌘↵ for Enter and a plain key otherwise', () => {
    expect(shortcutLabel({ key: 'Enter', mod: true })).toBe('⌘↵');
    expect(shortcutLabel({ key: 'g' })).toBe('G');
  });
});

describe('registerCommand + dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('binds the shortcut and preventDefaults the event', () => {
    const fn = make();
    const unreg = registerCommand(fn);
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true });
    document.dispatchEvent(e);
    expect(fn.handler).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    unreg();
  });

  it('requires the modifier for a mod shortcut', () => {
    const fn = make();
    const unreg = registerCommand(fn);
    fire({ key: 'k' });
    fire({ key: 'k', ctrlKey: true });
    expect(fn.handler).toHaveBeenCalledTimes(1);
    unreg();
  });

  it('ignores plain keys when a modifier is pressed', () => {
    const fn = make({ shortcut: { key: 'g' } });
    const unreg = registerCommand(fn);
    fire({ key: 'g' });
    fire({ key: 'g', metaKey: true });
    expect(fn.handler).toHaveBeenCalledTimes(1);
    unreg();
  });

  it('does not fire for a different key', () => {
    const fn = make();
    const unreg = registerCommand(fn);
    fire({ key: 'j', metaKey: true });
    expect(fn.handler).not.toHaveBeenCalled();
    unreg();
  });

  it('honours the `when` predicate', () => {
    const fn = make({ when: () => false });
    const unreg = registerCommand(fn);
    fire({ key: 'k', metaKey: true });
    expect(fn.handler).not.toHaveBeenCalled();
    unreg();
  });

  it('honours the `available` predicate at dispatch time', () => {
    const fn = make({ available: () => false });
    const unreg = registerCommand(fn);
    fire({ key: 'k', metaKey: true });
    expect(fn.handler).not.toHaveBeenCalled();
    unreg();
  });

  it('skips the event once someone else has prevented it', () => {
    const fn = make();
    const unreg = registerCommand(fn);
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true });
    e.preventDefault();
    document.dispatchEvent(e);
    expect(fn.handler).not.toHaveBeenCalled();
    unreg();
  });

  it('unregistering removes the binding', () => {
    const fn = make();
    const unreg = registerCommand(fn);
    unreg();
    fire({ key: 'k', metaKey: true });
    expect(fn.handler).not.toHaveBeenCalled();
  });

  it('overlay beats compose beats global for the same key', () => {
    const overlay = make({ id: 'c1', scope: 'overlay' });
    const compose = make({ id: 'c2', scope: 'compose' });
    const global = make({ id: 'c3', scope: 'global' });
    const un1 = registerCommand(global);
    const un2 = registerCommand(compose);
    const un3 = registerCommand(overlay);
    fire({ key: 'k', metaKey: true });
    expect(overlay.handler).toHaveBeenCalledTimes(1);
    expect(compose.handler).not.toHaveBeenCalled();
    expect(global.handler).not.toHaveBeenCalled();
    un1();
    un2();
    un3();
  });

  it('the most recently registered command wins within a scope', () => {
    const first = make({ id: 'c1', scope: 'overlay' });
    const second = make({ id: 'c2', scope: 'overlay' });
    const un1 = registerCommand(first);
    const un2 = registerCommand(second);
    fire({ key: 'k', metaKey: true });
    expect(second.handler).toHaveBeenCalledTimes(1);
    expect(first.handler).not.toHaveBeenCalled();
    un1();
    un2();
  });
});

describe('getCommands + subscribeCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists registered commands oldest first', () => {
    const a = make({ id: 'a' });
    const b = make({ id: 'b' });
    const unA = registerCommand(a);
    const unB = registerCommand(b);
    expect(getCommands().map((c) => c.id)).toEqual(['a', 'b']);
    unA();
    unB();
  });

  it('notifies subscribers on register and unregister', () => {
    const spy = vi.fn();
    const unsub = subscribeCommands(spy);
    const unreg = registerCommand(make());
    expect(spy).toHaveBeenCalledTimes(1);
    unreg();
    expect(spy).toHaveBeenCalledTimes(2);
    unsub();
  });
});

describe('useCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers on mount and unregisters on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useCommand(make({ handler })));
    expect(getCommands().map((c) => c.id)).toContain('cmd.test');
    fire({ key: 'k', metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
    expect(getCommands().map((c) => c.id)).not.toContain('cmd.test');
    fire({ key: 'k', metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});