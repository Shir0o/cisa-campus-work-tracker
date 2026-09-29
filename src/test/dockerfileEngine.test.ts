import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

// The runner installs production deps with `npm ci --omit=dev`. npm SILENTLY
// skips an optional dependency whose `engines.node` does not match the runtime,
// so a base image older than firebase-admin's optional deps lets the container
// build and then crash at startup with `Cannot find module
// '@google-cloud/firestore'` (#1116). Pin the Dockerfile's Node major to what
// the locked deps actually require, so a base-image or dependency bump cannot
// reintroduce the silent skip.

/** The lowest Node major a semver range demands, for the forms npm emits here. */
function requiredNodeMajor(range: string): number {
  const match = range.match(/(\d+)/);
  if (!match) throw new Error(`Unparseable engines.node range: ${range}`);
  return Number(match[1]);
}

describe('Dockerfile Node version satisfies locked engine floors', () => {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');

  const baseImages = [...dockerfile.matchAll(/^FROM\s+node:(\d+)/gm)].map((m) => Number(m[1]));
  const firebaseAdmin = lock.packages['node_modules/firebase-admin'];

  const floors: { name: string; major: number }[] = [];
  if (firebaseAdmin?.engines?.node) {
    floors.push({ name: 'firebase-admin', major: requiredNodeMajor(firebaseAdmin.engines.node) });
  }
  for (const dep of Object.keys(firebaseAdmin?.optionalDependencies ?? {})) {
    const entry = lock.packages[`node_modules/${dep}`];
    if (entry?.engines?.node) {
      floors.push({ name: dep, major: requiredNodeMajor(entry.engines.node) });
    }
  }

  it('has at least one node base image', () => {
    expect(baseImages.length).toBeGreaterThan(0);
  });

  it('uses a base image at least as new as every locked engine floor', () => {
    const needed = Math.max(...floors.map((f) => f.major));
    const reason = floors.map((f) => `${f.name}>=${f.major}`).join(', ');
    for (const major of baseImages) {
      expect(major, `Dockerfile FROM node:${major} but needs ${reason}`).toBeGreaterThanOrEqual(needed);
    }
  });
});
