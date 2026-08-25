// THE DAY'S GOAL (#544) — mobile live view of the team-wide goal. One number
// for every trainee, set by a full-timer; a trainee's phone only reads it to
// fill the queue's on-campus ring. Mirror of the web app's useDayGoal.
import { useEffect, useState } from 'react';
import { GOAL_DEFAULT_COUNT, type DayGoal } from '@cisa/core';
import { saveDayGoal, subscribeDayGoal } from './data/goal';

export interface DayGoalView {
  goal: DayGoal;
  setOn: (on: boolean) => void;
  setCount: (count: number) => void;
}

export function useDayGoal(): DayGoalView {
  const [goal, setGoal] = useState<DayGoal>({ on: true, count: GOAL_DEFAULT_COUNT });
  useEffect(
    () => subscribeDayGoal(setGoal, (e) => console.warn('Could not read the day goal', e)),
    [],
  );

  return {
    goal,
    setOn: (on) => void saveDayGoal({ on }),
    setCount: (count) => void saveDayGoal({ count }),
  };
}