// Week view — hour grid 7am→9pm, columns = days. Conflict markers, no avatars.
import {
  CAT_BY_ID,
  DAY_SHORT,
  startOfWeek,
  startOfDay,
  addDays,
  sameDay,
  eventEnd,
  eventOnDay,
  fmtTime,
  type CalendarEvent,
} from "../../lib/calendar/calendar";
import { Icon } from "./ui";
import type { HoverPayload } from "../../lib/calendar/types";

interface WeekViewProps {
  cursor: Date;
  events: CalendarEvent[];
  conflicts: Map<string, number>;
  onPickEvent: (ev: CalendarEvent) => void;
  onMoveEvent: (id: string, day: Date) => void;
  onCreateAt: (date: Date) => void;
  density: string;
  showWeekends: boolean;
  canDrag: boolean;
  setHoverEvent: (h: HoverPayload | null) => void;
}

export const WeekView = ({ cursor, events, conflicts, onPickEvent, onMoveEvent, onCreateAt, density, showWeekends, canDrag, setHoverEvent }: WeekViewProps) => {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const visible = showWeekends ? days : days.filter((d) => d.getDay() !== 0 && d.getDay() !== 6);
  const today = startOfDay(new Date());

  const HOUR_START = 7,
    HOUR_END = 21;
  const HOUR_PX = density === 'compact' ? 38 : density === 'spacious' ? 60 : 48;
  const hours: number[] = [];
  for (let h = HOUR_START; h < HOUR_END; h++) hours.push(h);

  const allDayEvents = (day: Date) => events.filter((e) => (e.allDay || e.end) && eventOnDay(e, day));
  const timedEvents = (day: Date) => events.filter((e) => !e.allDay && !e.end && eventOnDay(e, day));

  const yFor = (date: Date) => {
    const mins = (date.getHours() - HOUR_START) * 60 + date.getMinutes();
    return (mins / 60) * HOUR_PX;
  };

  return (
    <div className="week">
      <div className="week-head" style={{ gridTemplateColumns: `52px repeat(${visible.length}, 1fr)` }}>
        <div className="week-head-gutter" />
        {visible.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <div key={d.toISOString()} className={'week-head-day' + (isToday ? ' is-today' : '')}>
              <div className="week-head-dow">{DAY_SHORT[d.getDay()].toUpperCase()}</div>
              <div className="week-head-num">{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      <div className="week-allday" style={{ gridTemplateColumns: `52px repeat(${visible.length}, 1fr)` }}>
        <div className="week-allday-label">ALL-DAY</div>
        {visible.map((d) => {
          const list = allDayEvents(d);
          return (
            <div key={d.toISOString()} className="week-allday-col">
              {list.map((ev) => {
                const cat = CAT_BY_ID[ev.cat];
                return (
                  <button
                    key={ev.id}
                    className="week-allday-pill"
                    style={{ background: cat.soft, color: cat.ink, borderLeft: `3px solid ${cat.dot}` }}
                    onClick={() => onPickEvent(ev)}
                  >
                    {ev.title}
                    {ev.rrule && <Icon name="repeat" size={9} />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="week-body-scroll">
        <div className="week-body" style={{ gridTemplateColumns: `52px repeat(${visible.length}, 1fr)`, '--hour-px': HOUR_PX + 'px' } as React.CSSProperties}>
          <div className="week-gutter">
            {hours.map((h) => (
              <div key={h} className="week-gutter-cell" style={{ height: HOUR_PX }}>
                <span>{h === 12 ? '12p' : h > 12 ? h - 12 + 'p' : h + 'a'}</span>
              </div>
            ))}
          </div>

          {visible.map((d) => {
            const isToday = sameDay(d, today);
            const list = timedEvents(d).sort((a, b) => a.start.getTime() - b.start.getTime());
            const lanes: { s: number; e: number }[][] = [];
            const placed = list.map((ev) => {
              const s = ev.start.getTime();
              const e = eventEnd(ev).getTime();
              let lane = 0;
              while (lanes[lane] && lanes[lane].some((o) => !(o.e <= s || o.s >= e))) lane++;
              lanes[lane] = lanes[lane] || [];
              lanes[lane].push({ s, e });
              return { ev, lane };
            });
            const laneCount = Math.max(1, lanes.length);

            return (
              <div
                key={d.toISOString()}
                className={'week-day-col' + (isToday ? ' is-today' : '')}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const y = e.clientY - rect.top;
                  const hour = HOUR_START + y / HOUR_PX;
                  const target = new Date(d);
                  target.setHours(Math.floor(hour), Math.round(((hour % 1) * 60) / 15) * 15, 0, 0);
                  onCreateAt(target);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('is-drop');
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('is-drop')}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('is-drop');
                  const id = e.dataTransfer.getData('text/event');
                  if (id) onMoveEvent(id, d);
                }}
              >
                {hours.map((h, i) => (
                  <div key={h} className={'week-hourline' + (i === 0 ? ' is-first' : '')} style={{ height: HOUR_PX }} />
                ))}
                {isToday &&
                  (() => {
                    const now = new Date();
                    if (now.getHours() < HOUR_START || now.getHours() >= HOUR_END) return null;
                    const y = yFor(now);
                    return (
                      <div className="week-now" style={{ top: y }}>
                        <span className="week-now-dot" />
                        <span className="week-now-line" />
                      </div>
                    );
                  })()}
                {placed.map(({ ev, lane }) => {
                  const cat = CAT_BY_ID[ev.cat];
                  const top = yFor(ev.start);
                  const bottom = yFor(eventEnd(ev));
                  const height = Math.max(20, bottom - top);
                  const hasConflict = conflicts.has(ev.id);
                  return (
                    <button
                      key={ev.id}
                      className={'week-event' + (hasConflict ? ' has-conflict' : '')}
                      draggable={canDrag && !ev.rrule}
                      onDragStart={(e) => e.dataTransfer.setData('text/event', ev.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPickEvent(ev);
                      }}
                      onMouseEnter={(e) => setHoverEvent({ ev, x: e.clientX, y: e.clientY, conflicts: conflicts.get(ev.id) || 0 })}
                      onMouseLeave={() => setHoverEvent(null)}
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                        width: `calc(${(1 / laneCount) * 100}% - 4px)`,
                        background: cat.soft,
                        color: cat.ink,
                        borderLeft: `3px solid ${cat.dot}`,
                      }}
                    >
                      <div className="week-event-title">
                        <span>{ev.title}</span>
                        {ev.rrule && <Icon name="repeat" size={10} />}
                        {hasConflict && <Icon name="warn" size={11} className="event-warn" />}
                      </div>
                      <div className="week-event-meta">
                        <span>
                          {fmtTime(ev.start)}–{fmtTime(eventEnd(ev))}
                        </span>
                        {ev.loc && ev.loc !== '—' && <span className="week-event-loc">· {ev.loc}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
