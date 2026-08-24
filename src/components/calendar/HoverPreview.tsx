import { CAT_BY_ID, addDays, eventEnd, eventSpanDays, fmtDate, fmtTime, getEventCalendarLabel } from "../../lib/calendar/calendar";
import { Icon } from './ui';
import type { HoverPayload } from "../../lib/calendar/types";

export const HoverPreview = ({ hover, feedMap }: { hover: HoverPayload | null; feedMap?: Record<string, string> }) => {
  if (!hover) return null;
  const { ev, x, y, conflicts } = hover;
  const cat = CAT_BY_ID[ev.cat];
  const calInfo = getEventCalendarLabel(ev, feedMap);
  const W = 280,
    H = 170;
  const left = Math.min(x + 14, window.innerWidth - W - 12);
  const top = Math.min(y + 14, window.innerHeight - H - 12);
  return (
    <div className="hover-card" style={{ left, top, borderLeft: `3px solid ${cat.dot}` }}>
      <div className="hover-cat" style={{ color: cat.ink }}>
        <span className="catdot" style={{ width: 7, height: 7, background: cat.dot }} />
        <span>{cat.label.toUpperCase()}</span>
        {ev.rrule && <span className="hover-rep mono">REPEATS</span>}
      </div>
      <div className="hover-title">{ev.title}</div>
      <div className="hover-meta">
        <Icon name={calInfo.isGcal ? 'google' : 'cal'} size={11} />
        <span>{calInfo.name}</span>
      </div>
      <div className="hover-meta">
        <Icon name="clock" size={11} />
        <span>
          {ev.allDay
            ? fmtDate(ev.start) + (eventSpanDays(ev) > 1 ? ' → ' + fmtDate(addDays(eventEnd(ev), -1)) : '')
            : fmtDate(ev.start) + ' · ' + fmtTime(ev.start) + (ev.dur ? '–' + fmtTime(eventEnd(ev)) : '')}
        </span>
      </div>
      {ev.loc && ev.loc !== '—' && (
        <div className="hover-meta">
          <Icon name="pin" size={11} />
          <span>{ev.loc}</span>
        </div>
      )}
      {conflicts > 0 && (
        <div className="hover-conflict mono">
          <Icon name="warn" size={11} />
          <span>
            Conflicts with {conflicts} other event{conflicts > 1 ? 's' : ''}
          </span>
        </div>
      )}
      {ev.notes && <div className="hover-notes">{ev.notes}</div>}
    </div>
  );
};
