import { useEffect, useRef } from 'react';
import {
  CAT_BY_ID,
  conflictsForEvent,
  eventEnd,
  eventSpanDays,
  fmtDateLong,
  fmtTime,
  fmtTimeFull,
  getEventCalendarLabel,
  rruleSummary,
  type CalendarEvent,
} from "../../lib/calendar/calendar";
import { Btn, Icon, IconBtn } from './ui';

export interface EventDetailsProps {
  ev?: CalendarEvent;
  event?: CalendarEvent;
  allEvents: CalendarEvent[];
  canEdit: boolean;
  feedMap?: Record<string, string>;
  onClose: () => void;
  onEdit: ((opts?: { series?: boolean }) => void) | ((ev: CalendarEvent) => void);
  onDelete: ((ev: CalendarEvent, opts?: { series?: boolean }) => void) | ((id: string) => void);
  onSkipInstance?: (ev: CalendarEvent) => void;
  onPickEvent?: (ev: CalendarEvent) => void;
  onPickConflictEvent?: (ev: CalendarEvent) => void;
}

export const EventDetails = ({
  ev: rawEv,
  event: rawEvent,
  allEvents,
  canEdit,
  feedMap,
  onClose,
  onEdit,
  onDelete,
  onSkipInstance,
  onPickEvent,
  onPickConflictEvent,
}: EventDetailsProps) => {
  const ev = (rawEv || rawEvent)!;
  const handlePick = onPickEvent || onPickConflictEvent || (() => {});
  const handleDelete = (target: CalendarEvent, opts?: { series?: boolean }) => {
    if (onDelete.length === 1 && typeof target.id === 'string') {
      (onDelete as (id: string) => void)(target.id);
    } else {
      (onDelete as (ev: CalendarEvent, opts?: { series?: boolean }) => void)(target, opts);
    }
  };
  const handleEdit = (opts?: { series?: boolean }) => {
    if (onEdit.length === 1 && !opts) {
      (onEdit as (ev: CalendarEvent) => void)(ev);
    } else {
      (onEdit as (opts?: { series?: boolean }) => void)(opts);
    }
  };
  const asideRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && asideRef.current && asideRef.current.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [onClose]);
  const cat = CAT_BY_ID[ev.cat];
  const conflicts = conflictsForEvent(ev, allEvents);
  const isRecurring = !!ev.rrule || !!ev.__seriesId;
  const calInfo = getEventCalendarLabel(ev, feedMap);

  return (
    <aside className="details" role="dialog" ref={asideRef}>
      <header className="details-head">
        <div className="details-cat" style={{ color: cat.ink, background: cat.soft }}>
          <span className="catdot" style={{ width: 7, height: 7, background: cat.dot }} />
          <span>{cat.label}</span>
        </div>
        <div className="details-actions">
          {canEdit && !isRecurring && <IconBtn icon="edit" label="Edit" onClick={() => handleEdit()} />}
          {canEdit && !isRecurring && <IconBtn icon="trash" label="Delete" onClick={() => handleDelete(ev)} />}
          <IconBtn icon="close" label="Close" onClick={onClose} />
        </div>
      </header>
      <h2 className="details-title">{ev.title}</h2>

      {conflicts.length > 0 && (
        <div className="conflict-banner">
          <Icon name="warn" size={13} />
          <div className="conflict-banner-body">
            <div className="conflict-banner-head mono">
              CONFLICT · {conflicts.length} overlapping event{conflicts.length > 1 ? 's' : ''}
            </div>
            <ul>
              {conflicts.map((c) => {
                const cc = CAT_BY_ID[c.cat];
                return (
                  <li key={c.id}>
                    <button onClick={() => handlePick(c)}>
                      <span className="catdot" style={{ width: 6, height: 6, background: cc.dot }} />
                      <span className="conflict-time mono">
                        {fmtTime(c.start)}–{fmtTime(eventEnd(c))}
                      </span>
                      <span className="conflict-title">{c.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <ul className="details-facts">
        <li className="details-fact">
          <span className="details-fact-icon">
            <Icon name="clock" size={14} />
          </span>
          <div className="details-fact-body">
            <div className="details-fact-main">{fmtDateLong(ev.start)}</div>
            <div className="details-fact-sub mono">
              {ev.allDay
                ? eventSpanDays(ev) > 1
                  ? 'All day · ' + eventSpanDays(ev) + ' days'
                  : 'All day'
                : ev.cat === 'deadline'
                  ? 'Due by ' + fmtTimeFull(ev.start)
                  : fmtTimeFull(ev.start) + ' – ' + fmtTimeFull(eventEnd(ev)) + ' · ' + ((ev.dur ?? 0) >= 60 ? (ev.dur ?? 0) / 60 + 'h' : (ev.dur ?? 0) + 'm')}
            </div>
            {isRecurring && (
              <div className="details-fact-chip">
                <Icon name="repeat" size={10} />
                <span>{rruleSummary(ev.rrule)}</span>
              </div>
            )}
          </div>
        </li>

        <li className="details-fact">
          <span className="details-fact-icon">
            <Icon name={calInfo.isGcal ? "google" : "cal"} size={14} />
          </span>
          <div className="details-fact-body">
            <div className="details-fact-main">{calInfo.name}</div>
            {calInfo.isGcal && (
              <div className="details-fact-sub mono">Synced from Google Calendar</div>
            )}
          </div>
        </li>

        <li className="details-fact">
          <span className="details-fact-icon">
            <Icon name="pin" size={14} />
          </span>
          <div className="details-fact-body">
            <div className={'details-fact-main' + (!ev.loc || ev.loc === '—' ? ' is-empty' : '')}>{ev.loc && ev.loc !== '—' ? ev.loc : 'No location'}</div>
          </div>
        </li>

        {ev.notes && (
          <li className="details-fact">
            <span className="details-fact-icon">
              <Icon name="edit" size={14} />
            </span>
            <div className="details-fact-body">
              <div className="details-fact-notes">{ev.notes}</div>
            </div>
          </li>
        )}
      </ul>

      {canEdit && isRecurring && (
        <footer className="details-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Btn variant="ghost" leading="edit" onClick={() => handleEdit({ series: false })}>
              Edit this event
            </Btn>
            <span style={{ flex: 1 }} />
            <Btn variant="ghost" leading="edit" onClick={() => handleEdit({ series: true })}>
              Edit series
            </Btn>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Btn variant="ghost" leading="close" onClick={() => onSkipInstance?.(ev)}>
              Skip this date
            </Btn>
            <span style={{ flex: 1 }} />
            <Btn variant="ghost" leading="trash" onClick={() => handleDelete(ev, { series: true })}>
              Delete series
            </Btn>
          </div>
        </footer>
      )}
    </aside>
  );
};

export const EventDetailsModal = EventDetails;

