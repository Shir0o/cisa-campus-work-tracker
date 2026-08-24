// Month view — primary view. Dense, no scroll on day cells.
// Supports drag-to-reschedule (admins only), hover preview, conflict badges, click to open.
import {
  CAT_BY_ID,
  MONTH_SHORT,
  DAY_SHORT,
  monthGrid,
  startOfDay,
  addDays,
  sameDay,
  eventEnd,
  eventOnDay,
  fmtTime,
  MS_DAY,
  type CalendarEvent,
} from "../../lib/calendar/calendar";
import { Icon } from "./ui";
import type { HoverPayload, MorePayload } from "../../lib/calendar/types";

interface MonthViewProps {
  cursor: Date;
  events: CalendarEvent[];
  conflicts: Map<string, number>;
  onPickEvent: (ev: CalendarEvent) => void;
  onPickMore: (payload: MorePayload) => void;
  onMoveEvent: (id: string, day: Date) => void;
  onCreateAt: (date: Date) => void;
  density: string;
  showWeekends: boolean;
  canDrag: boolean;
  setHoverEvent: (h: HoverPayload | null) => void;
}

export const MonthView = ({ cursor, events, conflicts, onPickEvent, onPickMore, onMoveEvent, onCreateAt, density, showWeekends, canDrag, setHoverEvent }: MonthViewProps) => {
  const cells = monthGrid(cursor);
  const today = startOfDay(new Date());

  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) weeks.push(cells.slice(w * 7, w * 7 + 7));

  const showWeekendCol = (i: number) => showWeekends || (i >= 1 && i <= 5);
  const dayCols = showWeekends ? 7 : 5;

  return (
    <div className={'month ' + (density === 'compact' ? 'is-compact' : density === 'spacious' ? 'is-spacious' : '')}>
      <div className="month-header" style={{ gridTemplateColumns: `repeat(${dayCols}, 1fr)` }}>
        {DAY_SHORT.map((d, i) => {
          if (!showWeekendCol(i)) return null;
          return <div key={d} className="month-header-cell">{d}</div>;
        })}
      </div>

      <div className="month-grid">
        {weeks.map((week, wi) => (
          <MonthWeek
            key={wi}
            days={week}
            events={events}
            conflicts={conflicts}
            cursor={cursor}
            today={today}
            onPickEvent={onPickEvent}
            onPickMore={onPickMore}
            onMoveEvent={onMoveEvent}
            onCreateAt={onCreateAt}
            showWeekends={showWeekends}
            density={density}
            canDrag={canDrag}
            setHoverEvent={setHoverEvent}
          />
        ))}
      </div>
    </div>
  );
};

interface MonthWeekProps {
  days: Date[];
  events: CalendarEvent[];
  conflicts: Map<string, number>;
  cursor: Date;
  today: Date;
  onPickEvent: (ev: CalendarEvent) => void;
  onPickMore: (payload: MorePayload) => void;
  onMoveEvent: (id: string, day: Date) => void;
  onCreateAt: (date: Date) => void;
  showWeekends: boolean;
  density: string;
  canDrag: boolean;
  setHoverEvent: (h: HoverPayload | null) => void;
}

interface Placed {
  ev: CalendarEvent;
  startIdx: number;
  endIdx: number;
  lane: number;
}

const MonthWeek = ({ days, events, conflicts, cursor, today, onPickEvent, onPickMore, onMoveEvent, onCreateAt, showWeekends, density, canDrag, setHoverEvent }: MonthWeekProps) => {
  const visibleIdx = showWeekends
    ? [0, 1, 2, 3, 4, 5, 6]
    : days.map((_, i) => i).filter((i) => {
        const dow = days[i].getDay();
        return dow !== 0 && dow !== 6;
      });
  const cols = visibleIdx.length;
  const weekStart = startOfDay(days[0]);
  const weekEnd = addDays(weekStart, 7);

  const multi = events
    .filter((e) => e.allDay || e.end)
    .filter((e) => {
      const s = startOfDay(e.start);
      const en = startOfDay(eventEnd(e));
      return s < weekEnd && en > weekStart;
    });

  const lanes: Placed[][] = [];
  const placed: Placed[] = multi
    .map((e) => {
      const s = startOfDay(e.start);
      const en = startOfDay(eventEnd(e));
      const startIdx = Math.max(0, Math.floor((s.getTime() - weekStart.getTime()) / MS_DAY));
      const endIdx = Math.min(7, Math.ceil((en.getTime() - weekStart.getTime()) / MS_DAY));
      return { ev: e, startIdx, endIdx, lane: 0 };
    })
    .sort((a, b) => a.startIdx - b.startIdx || (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx));
  placed.forEach((p) => {
    let lane = 0;
    while (lanes[lane] && lanes[lane].some((o) => !(o.endIdx <= p.startIdx || o.startIdx >= p.endIdx))) lane++;
    lanes[lane] = lanes[lane] || [];
    lanes[lane].push(p);
    p.lane = lane;
  });

  const singles = (day: Date) => events.filter((e) => !e.allDay && !e.end && eventOnDay(e, day)).sort((a, b) => a.start.getTime() - b.start.getTime());

  const dragHandlers = (day: Date) => ({
    onDragOver: (ev: React.DragEvent) => {
      ev.preventDefault();
      ev.currentTarget.classList.add('is-drop');
    },
    onDragLeave: (ev: React.DragEvent) => ev.currentTarget.classList.remove('is-drop'),
    onDrop: (ev: React.DragEvent) => {
      ev.preventDefault();
      ev.currentTarget.classList.remove('is-drop');
      const id = ev.dataTransfer.getData('text/event');
      if (id) onMoveEvent(id, day);
    },
  });

  const dayConflictCount = (day: Date) => {
    let n = 0;
    singles(day).forEach((ev) => {
      if (conflicts.has(ev.id)) n++;
    });
    return n;
  };

  return (
    <div className="month-week" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {visibleIdx.map((i) => {
        const day = days[i];
        const inMonth = day.getMonth() === cursor.getMonth();
        const isToday = sameDay(day, today);
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const conflictN = dayConflictCount(day);
        return (
          <div
            key={i}
            className={'month-cell' + (inMonth ? '' : ' is-out') + (isToday ? ' is-today' : '') + (isWeekend ? ' is-weekend' : '')}
            onDoubleClick={() => onCreateAt(day)}
            {...dragHandlers(day)}
          >
            <div className="month-cell-head">
              <span className="month-cell-date">
                {day.getDate() === 1 && <span className="month-cell-mo">{MONTH_SHORT[day.getMonth()]}</span>}
                {day.getDate()}
              </span>
              {isToday && <span className="today-pill">TODAY</span>}
              {!isToday && conflictN > 0 && (
                <span className="cell-conflict-badge mono" title={conflictN + ' overlap' + (conflictN > 1 ? 's' : '')}>
                  <Icon name="warn" size={9} />
                  {conflictN}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div className="month-bars" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {placed.map(({ ev, startIdx, endIdx, lane }) => {
          const visStart = visibleIdx.findIndex((v) => v >= startIdx);
          let visEnd = -1;
          for (let k = visibleIdx.length - 1; k >= 0; k--) {
            if (visibleIdx[k] < endIdx) {
              visEnd = k + 1;
              break;
            }
          }
          if (visStart === -1 || visEnd === -1 || visEnd <= visStart) return null;
          const cat = CAT_BY_ID[ev.cat];
          return (
            <button
              key={ev.id}
              className="month-bar"
              style={{
                gridColumn: `${visStart + 1} / ${visEnd + 1}`,
                gridRow: lane + 1,
                background: cat.soft,
                color: cat.ink,
                borderLeft: `3px solid ${cat.dot}`,
              }}
              draggable={canDrag && !ev.rrule}
              onDragStart={(e) => e.dataTransfer.setData('text/event', ev.id)}
              onClick={(e) => {
                e.stopPropagation();
                onPickEvent(ev);
              }}
              onMouseEnter={(e) => setHoverEvent({ ev, x: e.clientX, y: e.clientY, conflicts: conflicts.get(ev.id) || 0 })}
              onMouseLeave={() => setHoverEvent(null)}
            >
              {ev.cat === 'travel' && <Icon name="pin" size={11} />}
              <span className="month-bar-title">{ev.title}</span>
              {ev.rrule && <Icon name="repeat" size={10} />}
            </button>
          );
        })}
      </div>

      <div className="month-singles" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {visibleIdx.map((i) => {
          const day = days[i];
          const list = singles(day);
          const limit = density === 'compact' ? 5 : density === 'spacious' ? 3 : 4;
          const shown = list.slice(0, limit);
          const hidden = list.length - shown.length;
          const barTop = lanes.length;
          return (
            <div key={i} className="month-single-col" style={{ paddingTop: barTop * 22 + 4 }}>
              {shown.map((ev) => {
                const cat = CAT_BY_ID[ev.cat];
                const hasConflict = conflicts.has(ev.id);
                return (
                  <button
                    key={ev.id}
                    className={'month-event' + (hasConflict ? ' has-conflict' : '')}
                    draggable={canDrag && !ev.rrule}
                    onDragStart={(e) => e.dataTransfer.setData('text/event', ev.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickEvent(ev);
                    }}
                    onMouseEnter={(e) => setHoverEvent({ ev, x: e.clientX, y: e.clientY, conflicts: conflicts.get(ev.id) || 0 })}
                    onMouseLeave={() => setHoverEvent(null)}
                    style={{ '--cat': cat.dot, '--cat-ink': cat.ink, '--cat-soft': cat.soft } as React.CSSProperties}
                  >
                    {ev.cat === 'deadline' ? (
                      <>
                        <Icon name="spark" size={9} />
                        <span className="month-event-title">{ev.title}</span>
                      </>
                    ) : (
                      <>
                        <span className="month-event-time">{fmtTime(ev.start)}</span>
                        <span className="month-event-title">{ev.title}</span>
                        {ev.rrule && <Icon name="repeat" size={9} />}
                        {hasConflict && <Icon name="warn" size={10} className="event-warn" />}
                      </>
                    )}
                  </button>
                );
              })}
              {hidden > 0 && (
                <button className="month-more" onClick={() => onPickMore({ day, events: list })}>
                  +{hidden} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
