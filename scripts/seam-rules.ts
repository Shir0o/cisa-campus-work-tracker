/**
 * Seam-map rules (#1473).
 *
 * `e2e/seams.json` maps each seam (a place where a change has escaped before)
 * to the paths that implement it and the specs that guard it. These are the
 * pure checks behind `scripts/check-seams.ts`; the logic is unit-tested from
 * src/test/seamRules.test.ts.
 */

export interface Seam {
  name: string;
  /** Globs of the files that implement the seam. */
  paths: string[];
  /** Journey specs (or the query-contract suite) that guard it; any one counts. */
  guards: string[];
}

export interface SeamMap {
  seams: Seam[];
}

export interface DeadEntry {
  seam: string;
  kind: 'path' | 'guard';
  pattern: string;
}

export interface UnguardedSeam {
  seam: string;
  touched: string[];
  guards: string[];
}

function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

export function matchesGlob(file: string, glob: string): boolean {
  return globToRegExp(glob).test(file);
}

function matchesAny(file: string, globs: string[]): boolean {
  return globs.some((g) => matchesGlob(file, g));
}

export function parseSeamMap(text: string): SeamMap {
  const raw: unknown = JSON.parse(text);
  const seams = (raw as { seams?: unknown } | null)?.seams;
  if (!Array.isArray(seams)) throw new Error('seam map needs a "seams" array');
  const names = new Set<string>();
  for (const s of seams as Partial<Seam>[]) {
    if (!s || typeof s.name !== 'string' || s.name === '') {
      throw new Error('every seam needs a name');
    }
    if (names.has(s.name)) throw new Error(`duplicate seam name: ${s.name}`);
    names.add(s.name);
    for (const key of ['paths', 'guards'] as const) {
      const list = s[key];
      if (!Array.isArray(list) || list.length === 0 || list.some((p) => typeof p !== 'string')) {
        throw new Error(`seam "${s.name}" needs a non-empty "${key}" array of strings`);
      }
    }
  }
  return raw as SeamMap;
}

/** Every path or guard glob that matches no file: the map has rotted. */
export function findDeadEntries(map: SeamMap, files: string[]): DeadEntry[] {
  const dead: DeadEntry[] = [];
  for (const seam of map.seams) {
    for (const kind of ['path', 'guard'] as const) {
      for (const pattern of kind === 'path' ? seam.paths : seam.guards) {
        if (!files.some((f) => matchesGlob(f, pattern))) {
          dead.push({ seam: seam.name, kind, pattern });
        }
      }
    }
  }
  return dead;
}

/** Seams the change touches where none of the seam's guards changed too. */
export function findUnguardedSeams(map: SeamMap, changed: string[]): UnguardedSeam[] {
  const out: UnguardedSeam[] = [];
  for (const seam of map.seams) {
    const touched = changed.filter((f) => matchesAny(f, seam.paths));
    if (touched.length === 0) continue;
    if (changed.some((f) => matchesAny(f, seam.guards))) continue;
    out.push({ seam: seam.name, touched, guards: seam.guards });
  }
  return out;
}

/** Workflow-command data must escape %, CR and LF to stay on one line. */
function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export function formatWarning(u: UnguardedSeam): string {
  const msg =
    `Seam "${u.seam}" changed (${u.touched.join(', ')}) but none of its guards did. ` +
    `Extend ${u.guards.join(' or ')}, or say in the PR why not.`;
  return `::warning title=Seam changed without its guard::${escapeData(msg)}`;
}
