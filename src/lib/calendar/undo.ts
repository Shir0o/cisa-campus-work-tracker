// In-memory undo stack for event mutations. Lost on refresh; local to this tab.
import { useSyncExternalStore } from 'react';

export interface UndoEntry {
  id: string;
  label: string;
  createdAt: number;
  apply: () => Promise<void>;
}

const CAP = 20;

let stack: UndoEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function pushUndo(entry: Omit<UndoEntry, 'id' | 'createdAt'>): void {
  const full: UndoEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  stack = [...stack, full];
  if (stack.length > CAP) stack = stack.slice(stack.length - CAP);
  emit();
}

export async function popAndApply(): Promise<UndoEntry | null> {
  const entry = stack[stack.length - 1];
  if (!entry) return null;
  stack = stack.slice(0, -1);
  emit();
  try {
    await entry.apply();
  } catch (e) {
    console.error('undo failed', e);
  }
  return entry;
}

export function dismissTop(): void {
  if (!stack.length) return;
  stack = stack.slice(0, -1);
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): UndoEntry[] {
  return stack;
}

export function useUndoStack(): UndoEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
