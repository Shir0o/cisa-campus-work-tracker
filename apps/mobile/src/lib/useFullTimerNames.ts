// uid → name for the approved Full-timers. Three v2 screens name a staffer
// they only hold a uid for — The Board ("…· Ana leading"), an open page ("Ana
// keeps this page.") and Settings ("Ana cares for you") — so the roster read
// lives once, here.
//
// A name is decoration on all three: a page still reads and Settings still
// works without it, so a failed read resolves to no names rather than an error.
import { useEffect, useMemo, useState } from 'react';
import type { FullTimerSummary } from '@cisa/core';
import { subscribeFullTimers } from './data/users';

export function useFullTimerNames(): Record<string, string> {
  const [fullTimers, setFullTimers] = useState<FullTimerSummary[]>([]);
  useEffect(() => subscribeFullTimers(setFullTimers, () => setFullTimers([])), []);
  return useMemo(() => Object.fromEntries(fullTimers.map((f) => [f.uid, f.name])), [fullTimers]);
}
