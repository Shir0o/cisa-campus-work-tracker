import { useMemo } from 'react';
import { suggestDates, DAY_SHORT, MONTH_SHORT, type CalendarEvent } from "../../../lib/calendar/calendar";

interface SuggestDatesProps {
  date: Date;
  dur: number;
  allEvents: CalendarEvent[];
  includeWeekends?: boolean;
  onPick: (d: Date) => void;
}

export const SuggestDates = ({ date, dur, allEvents, includeWeekends = false, onPick }: SuggestDatesProps) => {
  const list = useMemo(() => suggestDates(date, dur, allEvents, 6, includeWeekends), [date, dur, allEvents, includeWeekends]);
  return (
    <div className="finder">
      <div className="finder-head">
        <span className="finder-title">{includeWeekends ? 'Quietest upcoming days' : 'Quietest upcoming weekdays'}</span>
        <span className="finder-key mono">9a–6p workload</span>
      </div>
      <div className="suggest-list">
        {list.map(({ date: d, count, busyMins }) => {
          const pct = Math.min(1, busyMins / (9 * 60));
          return (
            <button key={d.toISOString()} className="suggest-row" onClick={() => onPick(d)}>
              <span className="suggest-dow mono">{DAY_SHORT[d.getDay()].toUpperCase()}</span>
              <span className="suggest-num mono">{d.getDate()}</span>
              <span className="suggest-mo">{MONTH_SHORT[d.getMonth()]}</span>
              <span className="suggest-bar">
                <span className="suggest-bar-fill" style={{ width: pct * 100 + '%' }} />
              </span>
              <span className="suggest-count mono">{count === 0 ? 'wide open' : count + ' event' + (count > 1 ? 's' : '')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
