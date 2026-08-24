import { useMemo } from 'react';
import { suggestSlots, fmtDate, type CalendarEvent } from "../../../lib/calendar/calendar";

interface FindFreeSlotProps {
  date: Date;
  dur: number;
  allEvents: CalendarEvent[];
  currentH: number;
  currentM: number;
  onPick: (h: number, m: number) => void;
}

export const FindFreeSlot = ({ date, dur, allEvents, currentH, currentM, onPick }: FindFreeSlotProps) => {
  const slots = useMemo(() => suggestSlots(date, dur, allEvents), [date, dur, allEvents]);
  return (
    <div className="finder">
      <div className="finder-head">
        <span className="finder-title">
          {fmtDate(date)} · {dur < 60 ? dur + 'm' : dur / 60 + 'h'} slots
        </span>
        <span className="finder-key">
          <span className="finder-key-item">
            <span className="finder-key-swatch sw-free" />
            free
          </span>
          <span className="finder-key-item">
            <span className="finder-key-swatch sw-busy" />
            busy
          </span>
        </span>
      </div>
      <div className="finder-grid">
        {slots.map(({ h, m, conflicts }) => {
          const cls = conflicts === 0 ? 'sw-free' : 'sw-busy';
          const isCurrent = h === currentH && m === currentM;
          return (
            <button
              key={h + ':' + m}
              className={'finder-slot ' + cls + (isCurrent ? ' is-current' : '')}
              title={conflicts === 0 ? 'Free' : conflicts + ' event' + (conflicts > 1 ? 's' : '') + ' overlap'}
              onClick={() => onPick(h, m)}
            >
              <span className="finder-time mono">{(h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h >= 12 ? 'p' : 'a')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
