// Live data for the native Community landing — the approved Full-timer
// roster for "Reach out". Mirrors src/views/landings/LandingCommunity.tsx.
import { useEffect, useState } from 'react';
import type { FullTimerSummary } from '@cisa/core';
import { subscribeFullTimers } from './data/users';

export function useCommunityLandingData() {
  const [fullTimers, setFullTimers] = useState<FullTimerSummary[]>([]);

  useEffect(() => subscribeFullTimers(setFullTimers, () => setFullTimers([])), []);

  return { fullTimers };
}
