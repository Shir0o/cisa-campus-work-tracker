import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// server.ts runs under tsx, where `import.meta.env` is undefined, so it must
// never load the client Firebase SDK module (src/lib/firebase.ts reads
// `import.meta.env.VITE_*` at module scope and crashes `npm run dev` on boot).
// Vitest defines import.meta.env, so only a static walk of the import graph
// catches a regression here.

const ROOT = path.resolve(__dirname, "../..");
const CLIENT_FIREBASE = path.join(ROOT, "src/lib/firebase.ts");

// Runtime imports only: `import type …` / `export type …` are erased by tsx.
const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gm;

function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function runtimeImportGraph(entry: string): Map<string, string | null> {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const dep = resolveLocal(file, match[1]);
      if (dep && !parent.has(dep)) {
        parent.set(dep, file);
        queue.push(dep);
      }
    }
  }
  return parent;
}

function chainTo(graph: Map<string, string | null>, target: string): string {
  const chain: string[] = [];
  for (let at: string | null | undefined = target; at; at = graph.get(at)) chain.unshift(path.relative(ROOT, at));
  return chain.join(" -> ");
}

describe("server.ts import graph", () => {
  it("walks into server-imported src/lib modules", () => {
    const graph = runtimeImportGraph(path.join(ROOT, "server.ts"));
    expect(graph.has(path.join(ROOT, "src/lib/contactTies.ts"))).toBe(true);
  });

  it("never loads the client Firebase SDK module", () => {
    const graph = runtimeImportGraph(path.join(ROOT, "server.ts"));
    const chain = graph.has(CLIENT_FIREBASE) ? chainTo(graph, CLIENT_FIREBASE) : "";
    expect(chain).toBe("");
  });
});
