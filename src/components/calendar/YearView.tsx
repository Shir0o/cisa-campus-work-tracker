// Year view — twelve mini month heatmaps with category dots.
import { useMemo } from 'react';
import {
  CAT_BY_ID,
  MONTH_NAMES,
  monthGrid,
  startOfDay,
  addDays,
  sameDay,
  eventEnd,
  type CalendarEvent,
} from "../../lib/calendar/calendar";
import { Icon } from "./ui";

interface YearViewProps {
  cursor: Date;
  events: CalendarEvent[];
  onPickEvent: (ev: CalendarEvent) => void;
  onPickMonth: (d: Date) => void;
}

export const YearView = ({ cursor, events, onPickEvent, onPickMonth }: YearViewProps) => {
  const year = cursor.getFullYear();
  const today = startOfDay(new Date());

  const dayCat = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((ev) => {
      const s = startOfDay(ev.start);
      const e = startOfDay(eventEnd(ev));
      for (let d = new Date(s); d < e || (e.getTime() === s.getTime() && d.getTime() === s.getTime()); d = addDays(d, 1)) {
        if (d.getFullYear() !== year) {
          if (d > e) break;
          continue;
        }
        const key = d.toISOString();
        (map[key] = map[key] || []).push(ev);
        if (e.getTime() === s.getTime()) break;
      }
    });
    return map;
  }, [events, year]);

  return (
    <div className="year">
      {Array.from({ length: 12 }, (_, m) => {
        const date = new Date(year, m, 1);
        const grid = monthGrid(date);
        return (
          <div key={m} className="year-month">
            <button className="year-month-head" onClick={() => onPickMonth(date)}>
              <span>{MONTH_NAMES[m]}</span>
              <Icon name="arrow" size={11} />
            </button>
            <div className="year-month-dows">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div className="year-month-grid">
              {grid.map((day, i) => {
                const inMonth = day.getMonth() === m;
                const isToday = sameDay(day, today);
                const key = startOfDay(day).toISOString();
                const evs = dayCat[key];
                const top = evs && evs[0] ? CAT_BY_ID[evs[0].cat] : null;
                return (
                  <button
                    key={i}
                    className={'year-cell' + (inMonth ? '' : ' is-out') + (isToday ? ' is-today' : '')}
                    onClick={() => evs && evs.length && onPickEvent(evs[0])}
                    title={evs ? evs.map((e) => e.title).join(', ') : ''}
                  >
                    <span className="year-cell-n">{day.getDate()}</span>
                    {top && inMonth && (
                      <span className="year-cell-dots">
                        {evs!.slice(0, 3).map((e, j) => (
                          <span key={j} style={{ background: CAT_BY_ID[e.cat].dot }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
