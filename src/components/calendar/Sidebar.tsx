import { useMemo } from 'react';
import {
  CATEGORIES,
  CAT_BY_ID,
  MONTH_NAMES,
  MONTH_SHORT,
  DAY_SHORT,
  monthGrid,
  startOfDay,
  addDays,
  sameDay,
  eventEnd,
  expandEvents,
  fmtTime,
  MS_DAY,
  type CalendarEvent,
  type CategoryId,
  type Category,
} from "../../lib/calendar/calendar";
import { Icon, IconBtn, Kbd } from './ui';
import type { Role } from "../../lib/calendar/types";

// ─── Mini calendar ───────────────────────────────────────────────────────────
const MiniCal = ({
  cursor,
  setCursor,
  events,
  accent,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  events: CalendarEvent[];
  accent: { c: string };
}) => {
  const grid = monthGrid(cursor);
  const today = startOfDay(new Date());
  const hasEvent = useMemo(() => {
    const m = new Set<string>();
    events.forEach((ev) => {
      const s = startOfDay(ev.start);
      const e = startOfDay(eventEnd(ev));
      for (let d = new Date(s); d < e || d.getTime() === s.getTime(); d = addDays(d, 1)) {
        m.add(d.toISOString());
        if (e.getTime() === s.getTime()) break;
      }
    });
    return m;
  }, [events]);

  return (
    <div className="mini">
      <div className="mini-head">
        <span className="mini-title">
          {MONTH_NAMES[cursor.getMonth()]} <span className="mini-year mono">{cursor.getFullYear()}</span>
        </span>
        <span className="mini-nav">
          <IconBtn icon="chevL" label="Prev" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
          <IconBtn icon="chevR" label="Next" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
        </span>
      </div>
      <div className="mini-dows">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mini-grid">
        {grid.map((d, i) => {
          const out = d.getMonth() !== cursor.getMonth();
          const isToday = sameDay(d, today);
          const sel = sameDay(d, cursor);
          const dot = hasEvent.has(startOfDay(d).toISOString());
          return (
            <button
              key={i}
              className={'mini-cell' + (out ? ' is-out' : '') + (isToday ? ' is-today' : '') + (sel ? ' is-sel' : '')}
              onClick={() => setCursor(new Date(d))}
            >
              <span>{d.getDate()}</span>
              {dot && !out && <span className="mini-dot" style={{ background: accent.c }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Coming Up panel ──────────────────────────────────────────────────────────
const ComingUp = ({ events, onPickEvent }: { events: CalendarEvent[]; onPickEvent: (ev: CalendarEvent) => void }) => {
  const today = startOfDay(new Date());
  const expanded = useMemo(() => {
    const start = startOfDay(new Date());
    return expandEvents(events, start, addDays(start, 60));
  }, [events]);
  const upcoming = expanded
    .filter((ev) => eventEnd(ev) >= new Date())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 7);

  const groups: Record<string, CalendarEvent[]> = {};
  upcoming.forEach((ev) => {
    const key = startOfDay(ev.start).toISOString();
    (groups[key] = groups[key] || []).push(ev);
  });

  const relLabel = (day: Date) => {
    const diff = Math.round((startOfDay(day).getTime() - today.getTime()) / MS_DAY);
    if (diff === 0) return 'TODAY';
    if (diff === 1) return 'TOMORROW';
    if (diff < 7) return DAY_SHORT[day.getDay()].toUpperCase();
    return MONTH_SHORT[day.getMonth()].toUpperCase() + ' ' + day.getDate();
  };

  if (upcoming.length === 0) return <div className="coming-up-empty mono">No upcoming events</div>;

  return (
    <div className="coming-up">
      {Object.entries(groups).map(([key, items]) => {
        const day = new Date(key);
        return (
          <div key={key} className="coming-up-group">
            <div className="coming-up-head mono">
              <span className="coming-up-rel">{relLabel(day)}</span>
              <span className="coming-up-date">
                {MONTH_SHORT[day.getMonth()]} {day.getDate()}
              </span>
            </div>
            <ul>
              {items.map((ev) => {
                const cat = CAT_BY_ID[ev.cat];
                return (
                  <li key={ev.id}>
                    <button className="coming-up-item" onClick={() => onPickEvent(ev)}>
                      <span className="coming-up-time mono">{ev.allDay ? 'all' : fmtTime(ev.start)}</span>
                      <span className="catdot" style={{ width: 6, height: 6, background: cat.dot }} />
                      <span className="coming-up-title">{ev.title}</span>
                      {ev.rrule && <Icon name="repeat" size={9} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

interface SidebarProps {
  cursor: Date;
  setCursor: (d: Date) => void;
  rawEvents: CalendarEvent[];
  expandedEvents: CalendarEvent[];
  catFilter: CategoryId[];
  setCatFilter: (updater: CategoryId[] | ((f: CategoryId[]) => CategoryId[])) => void;
  accent: { c: string };
  role: Role;
  canCreate: boolean;
  onCreate: () => void;
  onOpenImport?: () => void;
  onPickEvent: (ev: CalendarEvent) => void;
  onOpenAccess?: () => void;
  onSignOut: () => void;
}

const ROLE_LABEL: Record<Role, string> = {
  member: 'SHARED · password',
  admin: 'ADMIN',
  owner: 'OWNER',
  denied: 'DENIED',
};

export const Sidebar = ({ cursor, setCursor, rawEvents, expandedEvents, catFilter, setCatFilter, accent, role, canCreate, onCreate, onOpenImport, onPickEvent, onOpenAccess, onSignOut }: SidebarProps) => {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rawEvents.forEach((ev) => {
      c[ev.cat] = (c[ev.cat] || 0) + 1;
    });
    return c;
  }, [rawEvents]);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark" style={{ background: accent.c }}>
          <span className="brand-glyph" />
        </div>
        <div>
          <div className="brand-name">Lattice</div>
          <div className="brand-sub mono">shared · calendar</div>
        </div>
      </div>

      {canCreate && (
        <button className="create-cta" onClick={onCreate} style={{ background: accent.c }}>
          <Icon name="plus" size={12} />
          <span>New event</span>
          <Kbd>C</Kbd>
        </button>
      )}

      {canCreate && onOpenImport && (
        <button className="import-cta" onClick={onOpenImport}>
          <Icon name="arrow" size={12} />
          <span>Import events</span>
        </button>
      )}

      <MiniCal cursor={cursor} setCursor={setCursor} events={expandedEvents} accent={accent} />

      <div className="side-section">
        <div className="side-section-head">
          <span>Coming up</span>
        </div>
        <ComingUp events={rawEvents} onPickEvent={onPickEvent} />
      </div>

      <div className="side-section">
        <div className="side-section-head">
          <span>Categories</span>
          <button className="link-btn" onClick={() => setCatFilter(catFilter.length ? [] : CATEGORIES.map((c) => c.id))}>
            {catFilter.length ? 'Show all' : 'Hide all'}
          </button>
        </div>
        <ul className="cat-list">
          {CATEGORIES.map((c: Category) => {
            const off = catFilter.includes(c.id);
            return (
              <li key={c.id}>
                <button
                  className={'cat-row' + (off ? ' is-off' : '')}
                  onClick={() => setCatFilter((f) => (f.includes(c.id) ? f.filter((x) => x !== c.id) : [...f, c.id]))}
                >
                  <span className="cat-swatch" style={{ background: c.dot, opacity: off ? 0.25 : 1 }} />
                  <span className="cat-name">{c.label}</span>
                  <span className="cat-count mono">{counts[c.id] || 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="sidebar-foot mono">
        <Icon name={role === 'member' ? 'lock' : 'shield'} size={10} />
        <span>{ROLE_LABEL[role]}</span>
        <span style={{ flex: 1 }} />
        {role === 'owner' && onOpenAccess && (
          <button className="link-btn" onClick={onOpenAccess} title="Manage admins">
            Access
          </button>
        )}
        <IconBtn icon="logout" label="Sign out" size={12} onClick={onSignOut} />
      </div>
    </aside>
  );
};
