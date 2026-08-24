// Timeline / Gantt view — category swimlanes across a 6-week window.
import {
  CATEGORIES,
  MONTH_SHORT,
  DAY_NARROW,
  startOfWeek,
  startOfMonth,
  startOfDay,
  addDays,
  sameDay,
  eventEnd,
  eventSpanDays,
  fmtTime,
  MS_DAY,
  type CalendarEvent,
} from "../../lib/calendar/calendar";
import { Icon } from "./ui";
import type { HoverPayload } from "../../lib/calendar/types";

interface TimelineViewProps {
  cursor: Date;
  events: CalendarEvent[];
  conflicts: Map<string, number>;
  onPickEvent: (ev: CalendarEvent) => void;
  setHoverEvent: (h: HoverPayload | null) => void;
}

export const TimelineView = ({ cursor, events, conflicts, onPickEvent, setHoverEvent }: TimelineViewProps) => {
  const start = startOfWeek(startOfMonth(cursor));
  const totalDays = 42;
  const end = addDays(start, totalDays);
  const DAY_PX = 36;
  const ROW_H = 38;
  const today = startOfDay(new Date());

  const lanesByCat = CATEGORIES.map((cat) => {
    const list = events
      .filter((e) => e.cat === cat.id)
      .filter((e) => {
        const s = startOfDay(e.start);
        const en = startOfDay(eventEnd(e));
        return s < end && en > start;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const rows: { s: number; e: number }[][] = [];
    const placed = list.map((ev) => {
      const s = startOfDay(ev.start).getTime();
      const e = startOfDay(eventEnd(ev)).getTime();
      let r = 0;
      while (rows[r] && rows[r].some((o) => !(o.e <= s || o.s >= e))) r++;
      rows[r] = rows[r] || [];
      rows[r].push({ s, e });
      return { ev, row: r };
    });
    return { cat, placed, rowCount: Math.max(1, rows.length) };
  });

  const xFor = (date: Date) => {
    const off = (startOfDay(date).getTime() - start.getTime()) / MS_DAY;
    return off * DAY_PX;
  };
  const widthFor = (ev: CalendarEvent) => {
    const span = Math.max(1, eventSpanDays(ev));
    return span * DAY_PX;
  };

  return (
    <div className="timeline">
      <div className="timeline-scroll">
        <div className="timeline-head" style={{ width: totalDays * DAY_PX }}>
          {Array.from({ length: totalDays }, (_, i) => {
            const day = addDays(start, i);
            const isFirstOfMonth = day.getDate() === 1 || i === 0;
            const isToday = sameDay(day, today);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <div key={i} className={'tl-head-cell' + (isToday ? ' is-today' : '') + (isWeekend ? ' is-weekend' : '')} style={{ width: DAY_PX }}>
                {isFirstOfMonth && <span className="tl-month-label">{MONTH_SHORT[day.getMonth()]}</span>}
                <span className="tl-dow">{DAY_NARROW[day.getDay()]}</span>
                <span className="tl-num">{day.getDate()}</span>
              </div>
            );
          })}
        </div>

        <div className="timeline-body" style={{ width: totalDays * DAY_PX }}>
          <div className="timeline-grid" style={{ width: totalDays * DAY_PX }}>
            {Array.from({ length: totalDays }, (_, i) => {
              const day = addDays(start, i);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const isToday = sameDay(day, today);
              return <div key={i} className={'tl-grid-col' + (isWeekend ? ' is-weekend' : '') + (isToday ? ' is-today' : '')} style={{ width: DAY_PX }} />;
            })}
          </div>

          {lanesByCat.map(({ cat, placed, rowCount }) => (
            <div key={cat.id} className="tl-swimlane" style={{ height: rowCount * ROW_H + 8 }}>
              <div className="tl-lane-label">
                <span className="catdot" style={{ width: 8, height: 8, background: cat.dot }} />
                <span>{cat.label}</span>
              </div>
              {placed.map(({ ev, row }) => {
                const x = xFor(ev.start);
                const w = widthFor(ev);
                const hasConflict = conflicts.has(ev.id);
                return (
                  <button
                    key={ev.id}
                    className={'tl-bar' + (hasConflict ? ' has-conflict' : '')}
                    style={{
                      left: x,
                      top: row * ROW_H + 4,
                      width: w - 4,
                      height: ROW_H - 8,
                      background: cat.soft,
                      color: cat.ink,
                      borderLeft: `3px solid ${cat.dot}`,
                    }}
                    onClick={() => onPickEvent(ev)}
                    onMouseEnter={(e) => setHoverEvent({ ev, x: e.clientX, y: e.clientY, conflicts: conflicts.get(ev.id) || 0 })}
                    onMouseLeave={() => setHoverEvent(null)}
                  >
                    <span className="tl-bar-title">{ev.title}</span>
                    {ev.rrule && <Icon name="repeat" size={10} />}
                    {hasConflict && <Icon name="warn" size={11} className="event-warn" />}
                    {w > 90 && !ev.allDay && <span className="tl-bar-meta">{fmtTime(ev.start)}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
