/**
 * Border radius scale monotonicity and component shape contract tests (issue #688 / ADR 0009).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

function themeRadius(token: string): number {
  const css = read(join('src', 'index.css'));
  const theme = css.slice(css.indexOf('@theme'), css.indexOf('@layer'));
  const match = new RegExp(`${token}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(theme);
  if (!match) throw new Error(`${token} is not declared in @theme`);
  return Number(match[1]);
}

describe('Border radius scale — monotonic ladder (issue #688, ADR 0009)', () => {
  it('declares a strictly monotonic radius ladder in @theme', () => {
    const sm = themeRadius('--radius-sm');
    const md = themeRadius('--radius-md');
    const base = themeRadius('--radius');
    const lg = themeRadius('--radius-lg');
    const xl = themeRadius('--radius-xl');
    const xl2 = themeRadius('--radius-2xl');
    const xl3 = themeRadius('--radius-3xl');

    expect(sm).toBe(10);
    expect(md).toBe(12);
    expect(base).toBe(14);
    expect(lg).toBe(20);
    expect(xl).toBe(24);
    expect(xl2).toBe(32);
    expect(xl3).toBe(40);

    expect(sm).toBeLessThan(md);
    expect(md).toBeLessThan(base);
    expect(base).toBeLessThan(lg);
    expect(lg).toBeLessThan(xl);
    expect(xl).toBeLessThan(xl2);
    expect(xl2).toBeLessThan(xl3);
  });

  it('keeps NavRail at the shell radius 32px (rounded-2xl)', () => {
    const navRailSource = read(join('src', 'components', 'layout', 'NavRail.tsx'));
    expect(navRailSource).toMatch(/bg-rail\s+rounded-2xl\s+shadow-shell/);
  });

  it('sets FeedbackFAB popup dialog to rounded-xl (24px) and textarea to rounded-sm (10px)', () => {
    const feedbackFabSource = read(join('src', 'components', 'FeedbackFAB.tsx'));
    // The dialog should be rounded-xl (24px)
    expect(feedbackFabSource).toMatch(/role="dialog"[\s\S]*?rounded-xl/);
    // The textarea should be rounded-sm (10px) rather than rounded-xl (which clamped to lozenge)
    expect(feedbackFabSource).toMatch(/<textarea[\s\S]*?rounded-sm/);
  });

  // The dedicated page composer was retired with ADR 0019 — the FAB above is
  // now the only one, and `/feedback` is the submitter's own notes instead.
  it('enforces 3-tier nesting in MyNotes: note card (rounded-xl), reply bubbles (rounded-lg), and textarea (rounded-sm)', () => {
    const myNotesSource = read(join('src', 'views', 'MyNotes.tsx'));
    // Outer note card is rounded-xl (24px)
    expect(myNotesSource).toContain('rounded-xl');
    // Follow-up bubbles nest one step in at rounded-lg
    expect(myNotesSource).toMatch(/text-xs rounded-lg p-3/);
    // The reply textarea is rounded-sm (10px)
    expect(myNotesSource).toMatch(/<textarea[\s\S]*?rounded-sm/);
  });
});
