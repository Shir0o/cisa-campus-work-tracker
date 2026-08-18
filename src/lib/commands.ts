import { useEffect, useRef } from 'react';
import type { AppRole } from './permissions';

// Central shortcut registry (#337). Every command declares its scope,
// description, shortcut, and handler in one place — the same registration
// both binds the key (a single document-level dispatcher) and populates the
// ⌘K palette. Shortcuts teach themselves.
//
// Scope decides precedence when several commands match the same key:
//   overlay > compose > global
// Within a scope the most recently registered command wins (the topmost
// overlay / the focused composer).
export type CommandScope = 'global' | 'overlay' | 'compose';

export interface CommandShortcut {
  /** The key, matched case-insensitively via `event.key` — e.g. 'k' or 'Enter'. */
  key: string;
  /** Requires ⌘ (macOS) or Ctrl everywhere else. */
  mod?: boolean;
}

export interface Command {
  id: string;
  scope: CommandScope;
  description: string;
  shortcut: CommandShortcut;
  /** Role gate for the palette listing. */
  minRole?: AppRole;
  /** Bound but not listed in the palette (e.g. the palette's own toggle). */
  hidden?: boolean;
  /** Extra condition checked at dispatch time (e.g. the focused element). */
  when?: (e: KeyboardEvent) => boolean;
  /** Whether the action is currently possible — gates both dispatch and the palette listing. */
  available?: () => boolean;
  handler: () => void;
}

const SCOPE_RANK: Record<CommandScope, number> = { overlay: 0, compose: 1, global: 2 };

interface Entry {
  order: number;
  get: () => Command;
}

const registry = new Map<string, Entry>();
let orderCounter = 0;
let listenerInstalled = false;
const listeners = new Set<() => void>();
let snapshot: Command[] = [];

function shortcutMatches(s: CommandShortcut, e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if (s.key.toLowerCase() !== key) return false;
  if (s.mod) return e.metaKey || e.ctrlKey;
  return !e.metaKey && !e.ctrlKey && !e.altKey;
}

function dispatch(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  let best: { rank: number; order: number; cmd: Command } | null = null;
  for (const entry of registry.values()) {
    const cmd = entry.get();
    if (!shortcutMatches(cmd.shortcut, e)) continue;
    if (cmd.when && !cmd.when(e)) continue;
    if (cmd.available && !cmd.available()) continue;
    const rank = SCOPE_RANK[cmd.scope];
    if (!best || rank < best.rank || (rank === best.rank && entry.order > best.order)) {
      best = { rank, order: entry.order, cmd };
    }
  }
  if (best) {
    e.preventDefault();
    best.cmd.handler();
  }
}

function ensureListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  document.addEventListener('keydown', dispatch);
}

function publish() {
  snapshot = [...registry.values()]
    .sort((a, b) => a.order - b.order)
    .map((e) => e.get());
  for (const l of listeners) l();
}

function register(id: string, get: () => Command) {
  registry.set(id, { order: orderCounter++, get });
  ensureListener();
  publish();
}

function unregister(id: string) {
  if (registry.delete(id)) publish();
}

/** Register a command imperatively. Returns an unregister function. */
export function registerCommand(cmd: Command): () => void {
  register(cmd.id, () => cmd);
  return () => unregister(cmd.id);
}

/**
 * React hook: registers the command for as long as the calling component is
 * mounted. The latest closure is picked up on every render, so handlers keep
 * fresh state without re-subscribing.
 */
export function useCommand(cmd: Command) {
  const ref = useRef(cmd);
  const id = cmd.id;
  useEffect(() => {
    ref.current = cmd;
  });
  useEffect(() => {
    register(id, () => ref.current);
    return () => unregister(id);
  }, [id]);
}

/** Subscribe to registry changes (for the palette listing). Returns an unsubscribe. */
export function subscribeCommands(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Stable snapshot of currently registered commands, oldest first. */
export function getCommands(): Command[] {
  return snapshot;
}

/** Human-readable label for a shortcut — ⌘K, ⌘↵ … */
export function shortcutLabel(s: CommandShortcut): string {
  const key = s.key.toLowerCase() === 'enter' ? '↵' : s.key.length === 1 ? s.key.toUpperCase() : s.key;
  return s.mod ? `⌘${key}` : key;
}