import { CAT_BY_ID, DAY_SHORT, MONTH_SHORT, fmtTime } from "../../lib/calendar/calendar";
import { Icon } from './ui';
import type { MorePayload } from "../../lib/calendar/types";
import type { CalendarEvent } from "../../lib/calendar/calendar";

export const MorePopover = ({
  payload,
  onClose,
  onPickEvent,
}: {
  payload: MorePayload | null;
  onClose: () => void;
  onPickEvent: (ev: CalendarEvent) => void;
}) => {
  if (!payload) return null;
  return (
    <div className="more-pop-backdrop" onClick={onClose}>
      <div className="more-pop" onClick={(e) => e.stopPropagation()}>
        <header className="more-pop-head">
          <span className="more-pop-dow">{DAY_SHORT[payload.day.getDay()].toUpperCase()}</span>
          <span className="more-pop-num">{payload.day.getDate()}</span>
          <span className="more-pop-mo">{MONTH_SHORT[payload.day.getMonth()]}</span>
          <button className="iconbtn" onClick={onClose}>
            <Icon name="close" size={12} />
          </button>
        </header>
        <div className="more-pop-list">
          {payload.events.map((ev) => {
            const cat = CAT_BY_ID[ev.cat];
            return (
              <button
                key={ev.id}
                className="more-pop-item"
                onClick={() => {
                  onPickEvent(ev);
                  onClose();
                }}
              >
                <span className="more-pop-time">{ev.allDay ? 'All day' : fmtTime(ev.start)}</span>
                <span className="catdot" style={{ width: 7, height: 7, background: cat.dot }} />
                <span className="more-pop-title">{ev.title}</span>
                {ev.rrule && <Icon name="repeat" size={10} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
