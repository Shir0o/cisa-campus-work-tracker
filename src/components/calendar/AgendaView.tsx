// Agenda / list view — large date glyphs grouped by day.
import {
  CAT_BY_ID,
  DAY_SHORT,
  MONTH_NAMES,
  startOfMonth,
  endOfMonth,
  startOfDay,
  addDays,
  sameDay,
  eventEnd,
  fmtTime,
  type CalendarEvent,
} from "../../lib/calendar/calendar";
import { Icon } from "./ui";

interface AgendaViewProps {
  cursor: Date;
  events: CalendarEvent[];
  conflicts: Map<string, number>;
  onPickEvent: (ev: CalendarEvent) => void;
}

export const AgendaView = ({ cursor, events, conflicts, onPickEvent }: AgendaViewProps) => {
  const start = startOfMonth(cursor);
  const end = addDays(endOfMonth(cursor), 1);
  const list = events
    .filter((e) => {
      const s = startOfDay(e.start);
      return s >= start && s < end;
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const groups: Record<string, CalendarEvent[]> = {};
  list.forEach((e) => {
    const key = startOfDay(e.start).toISOString();
    (groups[key] = groups[key] || []).push(e);
  });
  const today = startOfDay(new Date());

  return (
    <div className="agenda">
      {Object.keys(groups).length === 0 && <div className="agenda-empty">No events this month.</div>}
      {Object.entries(groups).map(([key, items]) => {
        const day = new Date(key);
        const isToday = sameDay(day, today);
        const isPast = day < today;
        return (
          <div key={key} className={'agenda-day' + (isToday ? ' is-today' : '') + (isPast ? ' is-past' : '')}>
            <div className="agenda-day-head">
              <div className="agenda-day-num">{day.getDate()}</div>
              <div className="agenda-day-info">
                <div className="agenda-day-dow">
                  {DAY_SHORT[day.getDay()]}
                  {isToday ? ' · TODAY' : ''}
                </div>
                <div className="agenda-day-mo">{MONTH_NAMES[day.getMonth()]}</div>
              </div>
              <div className="agenda-day-rule" />
              <div className="agenda-day-count">
                {items.length} {items.length === 1 ? 'event' : 'events'}
              </div>
            </div>
            <div className="agenda-items">
              {items.map((ev) => {
                const cat = CAT_BY_ID[ev.cat];
                const hasConflict = conflicts.has(ev.id);
                return (
                  <button key={ev.id} className={'agenda-item' + (hasConflict ? ' has-conflict' : '')} onClick={() => onPickEvent(ev)}>
                    <span className="agenda-time">
                      {ev.allDay ? 'All day' : ev.cat === 'deadline' ? 'Due ' + fmtTime(ev.start) : fmtTime(ev.start) + '–' + fmtTime(eventEnd(ev))}
                    </span>
                    <span className="agenda-cat" style={{ background: cat.dot }} />
                    <span className="agenda-title">
                      {ev.title}
                      {ev.rrule && <Icon name="repeat" size={10} className="agenda-rep" />}
                    </span>
                    <span className="agenda-cat-label" style={{ color: cat.ink }}>
                      {cat.label}
                    </span>
                    <span className="agenda-loc">{ev.loc}</span>
                    {hasConflict && (
                      <span className="agenda-conflict mono">
                        <Icon name="warn" size={11} /> CONFLICT
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
