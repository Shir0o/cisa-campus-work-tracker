/**
 * `--accent` / `--text` invariant.
 *
 * `--accent` is the interactive-text signal — links, clickable names, and
 * `hover:text-*` affordances resolve to it. If it ever byte-matches `--text`
 * in either theme, those usages go invisible (see the original defect that
 * landed `--accent: #0A0A0B` ≡ `--text: #0A0A0B` in light and the same in
 * dark — 227 usages became no-ops).
 *
 * This test is the durable guardrail. It reads `src/index.css` directly so
 * it doesn't depend on jsdom's CSS support, and asserts that the resolved
 * values of `--accent` and `--text` differ in both `:root` (light) and
 * `.dark` blocks.
 *
 * If a future change flattens `--accent` back toward `--text`, this test
 * fails before the change merges.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface TokenBlock {
  /** Selector the block lives under — `":root"` or `".dark"`. */
  selector: string;
  /** Declarations as written, after stripping `var(...)` indirections. */
  declarations: Record<string, string>;
}

const ROOT_SELECTORS = [':root', '.dark'] as const;
const TARGET_TOKENS = ['--accent', '--text'] as const;

function readIndexCss(): string {
  return readFileSync(
    join(process.cwd(), 'src', 'index.css'),
    'utf8',
  );
}

/**
 * Strip comments and pull out each top-level `:root` / `.dark` rule block.
 * The file's `:root` and `.dark` blocks live under `@layer base { ... }`,
 * which we don't need to track — only the selector and the body.
 */
function extractBlocks(css: string): TokenBlock[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: TokenBlock[] = [];
  for (const selector of ROOT_SELECTORS) {
    // Match `selector { ... }` — the body may itself contain nested braces
    // (it doesn't today, but be safe). Track depth.
    const re = new RegExp(`${escapeForRegex(selector)}\\s*\\{`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(stripped)) !== null) {
      const open = match.index + match[0].length;
      let depth = 1;
      let i = open;
      while (i < stripped.length && depth > 0) {
        const ch = stripped[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      const body = stripped.slice(open, i - 1);
      blocks.push({ selector, declarations: parseDeclarations(body) });
    }
  }
  return blocks;
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDeclarations(body: string): Record<string, string> {
  const decls: Record<string, string> = {};
  // Split on `;`, drop empty fragments, parse `name: value`.
  for (const fragment of body.split(';')) {
    const colon = fragment.indexOf(':');
    if (colon === -1) continue;
    const name = fragment.slice(0, colon).trim();
    const value = fragment.slice(colon + 1).trim();
    if (name.startsWith('--')) decls[name] = value;
  }
  return decls;
}

/**
 * Resolve a token's value by following `var(...)` indirections within the
 * same block. Stops at the first non-`var(...)` value. If the chain is
 * circular, returns the original token name.
 *
 * Examples:
 *   `--accent: #0A0A0B`                 → `#0A0A0B`
 *   `--accent: var(--text-dim)`         → (value of `--text-dim` in same block)
 *   `--text: #0A0A0B; --accent: var(--text-dim)` (where `--text-dim: #52525B`)
 *                                       → `#52525B`
 */
function resolve(
  name: string,
  declarations: Record<string, string>,
  seen: Set<string> = new Set(),
): string {
  if (seen.has(name)) return name; // cycle guard
  seen.add(name);
  const raw = declarations[name];
  if (raw === undefined) return '';
  const m = raw.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\s*\)$/);
  if (m) {
    const next = m[1];
    const fallback = m[2];
    const resolved = resolve(next, declarations, new Set(seen));
    return resolved || fallback || '';
  }
  return raw;
}

describe('--accent invariant', () => {
  const css = readIndexCss();
  const blocks = extractBlocks(css);

  for (const selector of ROOT_SELECTORS) {
    const block = blocks.find((b) => b.selector === selector);
    it(`declares --accent and --text under \`${selector}\``, () => {
      expect(block, `${selector} block should exist in src/index.css`).toBeDefined();
      const decls = block!.declarations;
      for (const token of TARGET_TOKENS) {
        expect(
          decls[token],
          `${selector} should declare ${token}`,
        ).toBeTruthy();
      }
    });

    it(`--accent !== --text under \`${selector}\` (interactive-text signal invariant)`, () => {
      const decls = block!.declarations;
      const accent = resolve('--accent', decls).toLowerCase();
      const text = resolve('--text', decls).toLowerCase();
      // Both must resolve to a non-empty value before comparing; if either
      // is empty, the test fails loud with a useful message.
      expect(accent, '--accent must resolve to a value').not.toBe('');
      expect(text, '--text must resolve to a value').not.toBe('');
      expect(
        accent,
        `--accent (${accent}) must differ from --text (${text}) in ${selector}`,
      ).not.toBe(text);
    });
  }
});