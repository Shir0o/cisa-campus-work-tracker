/**
 * A short, text-free trace of focus, composition and visual-viewport events,
 * carried on a Feedback Note so a keyboard bug can be read from the reporter's
 * own phone (#1735).
 *
 * Why this exists. Android closes the soft keyboard when the page blurs the
 * focused field. A harness cannot raise a real IME, so from a desk it is
 * impossible to tell "our code blurred it" from "the browser dismissed it while
 * focus stayed". The events below separate those two.
 *
 * It records event names, the focused element's tag/id/name, and the visual
 * viewport height. It never records a field's value or any typed text.
 */

interface TraceEntry {
  /** Milliseconds since install. */
  t: number;
  /** `focusin`, `focusout`, `compositionstart`, `compositionend`, `visibility` or `viewport`. */
  e: string;
  /** The element the event happened to, as `tag#id[name]`. */
  a?: string;
  /** Where focus went on a `focusout` (`null` when it left the page). */
  to?: string;
  /** The visual viewport height at a `viewport` event. */
  vv?: number;
  /** The first frames of the stack at a `focusout`, to name the caller. */
  s?: string;
}

// Room for one typing session plus the viewport churn Gboard fires while the
// keyboard animates, so the dismissal itself is never pushed out of the ring.
const CAPACITY = 40;
const entries: TraceEntry[] = [];
let installed = false;
let frame = 0;

function label(el: Element | null | undefined): string | undefined {
  if (!el || !el.tagName) return undefined;
  const tag = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id;
  const name = el.getAttribute?.('name');
  const type = el.getAttribute?.('type');
  return `${tag}${id ? `#${id}` : ''}${name ? `[name=${name}]` : ''}${type ? `[type=${type}]` : ''}`;
}

function record(entry: TraceEntry): void {
  entries.push(entry);
  if (entries.length > CAPACITY) entries.shift();
}

function caller(): string | undefined {
  const stack = new Error().stack;
  if (!stack) return undefined;
  return stack
    .split('\n')
    .slice(2, 5)
    .map((line) => line.trim().replace(/^at /, ''))
    .join(' | ')
    .slice(0, 200);
}

/** Start recording. Idempotent, and inert outside a browser. */
export function installInputTrace(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  const start = performance.now();
  const at = () => Math.round(performance.now() - start);

  document.addEventListener(
    'focusin',
    (e) => record({ t: at(), e: 'focusin', a: label(e.target as Element) }),
    true,
  );
  document.addEventListener(
    'focusout',
    (e) => {
      const ev = e as FocusEvent;
      record({
        t: at(),
        e: 'focusout',
        a: label(ev.target as Element),
        to: label(ev.relatedTarget as Element | null) ?? 'null',
        s: caller(),
      });
    },
    true,
  );
  document.addEventListener(
    'compositionstart',
    (e) => record({ t: at(), e: 'compositionstart', a: label(e.target as Element) }),
    true,
  );
  document.addEventListener(
    'compositionend',
    (e) => record({ t: at(), e: 'compositionend', a: label(e.target as Element) }),
    true,
  );
  document.addEventListener('visibilitychange', () =>
    record({ t: at(), e: 'visibility', a: document.visibilityState }),
  );

  const vv = window.visualViewport;
  if (!vv) return;
  const sample = () => {
    frame = 0;
    record({ t: at(), e: 'viewport', vv: Math.round(vv.height), a: label(document.activeElement) });
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(sample);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
}

/** The trace as one line per event, newest last. Empty when nothing happened. */
export function readInputTrace(): string {
  return entries
    .map((entry) => {
      const parts = [`+${entry.t}ms`, entry.e];
      if (entry.a) parts.push(entry.a);
      if (entry.to !== undefined) parts.push(`-> ${entry.to}`);
      if (entry.vv !== undefined) parts.push(`vv=${entry.vv}`);
      if (entry.s) parts.push(`@ ${entry.s}`);
      return parts.join(' ');
    })
    .join('\n');
}
