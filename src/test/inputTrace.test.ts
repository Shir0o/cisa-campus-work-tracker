import { describe, it, expect, beforeAll, vi } from 'vitest';

// The tracer binds its viewport listener at install, so the stand-in has to
// exist before the first import in a test.
beforeAll(() => {
  const vv = Object.assign(new EventTarget(), { height: 900 });
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
});

async function freshModule() {
  vi.resetModules();
  return import('../lib/inputTrace');
}

function field(id: string): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

describe('inputTrace', () => {
  it('records a focus change with where focus went', async () => {
    const { installInputTrace, readInputTrace } = await freshModule();
    installInputTrace();
    const note = field('note');

    note.focus();
    note.blur();

    const trace = readInputTrace();
    expect(trace).toContain('focusin textarea#note');
    expect(trace).toContain('focusout textarea#note -> null');
  });

  it('names the caller on a focusout', async () => {
    const { installInputTrace, readInputTrace } = await freshModule();
    installInputTrace();
    const note = field('reason');

    note.focus();
    note.blur();

    // The stack head is what names our code when it is the thing blurring.
    expect(readInputTrace().split('\n').pop()).toContain('@ ');
  });

  it('never records what was typed', async () => {
    const { installInputTrace, readInputTrace } = await freshModule();
    installInputTrace();
    const note = field('draft');

    note.focus();
    note.value = 'top secret words';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    note.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    note.dispatchEvent(new Event('input', { bubbles: true }));
    note.dispatchEvent(new Event('compositionend', { bubbles: true }));

    const trace = readInputTrace();
    expect(trace).toContain('compositionstart textarea#draft');
    expect(trace).not.toContain('secret');
    expect(trace).not.toContain(note.value);
  });

  it('keeps only the most recent events', async () => {
    const { installInputTrace, readInputTrace } = await freshModule();
    installInputTrace();
    const note = field('many');

    for (let i = 0; i < 60; i += 1) note.dispatchEvent(new Event('focusin', { bubbles: true }));

    expect(readInputTrace().split('\n').length).toBeLessThanOrEqual(40);
  });

  it('records the viewport the keyboard shrinks', async () => {
    const { installInputTrace, readInputTrace } = await freshModule();
    installInputTrace();
    const note = field('vv');
    note.focus();

    const vv = window.visualViewport as unknown as EventTarget;
    vv.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    expect(readInputTrace()).toContain('viewport textarea#vv vv=900');
  });

  it('records a tab going hidden', async () => {
    const { installInputTrace, readInputTrace } = await freshModule();
    installInputTrace();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(readInputTrace()).toContain('visibility hidden');
  });

  it('installs once, so a second call does not double-record', async () => {
    const { installInputTrace, readInputTrace } = await freshModule();
    installInputTrace();
    installInputTrace();
    const note = field('once');

    note.dispatchEvent(new Event('focusin', { bubbles: true }));

    expect(readInputTrace().split('\n')).toHaveLength(1);
  });

  it('is empty until something happens', async () => {
    const { installInputTrace, readInputTrace } = await freshModule();
    installInputTrace();
    expect(readInputTrace()).toBe('');
  });
});
