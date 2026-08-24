import { BYDAY_CODES, BYDAY_LABEL, isoDate, type Freq, type RRule } from "../../../lib/calendar/calendar";

const RECUR_PRESETS = [
  { id: 'none', label: "Doesn't repeat" },
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { id: 'weekly', label: 'Weekly on this day' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly on this date' },
  { id: 'custom', label: 'Custom…' },
];

function rruleFromPreset(preset: string, date: Date): RRule | null {
  const dow = BYDAY_CODES[date.getDay()];
  switch (preset) {
    case 'none':
      return null;
    case 'daily':
      return { freq: 'daily', interval: 1 };
    case 'weekdays':
      return { freq: 'weekly', interval: 1, byday: ['MO', 'TU', 'WE', 'TH', 'FR'] };
    case 'weekly':
      return { freq: 'weekly', interval: 1, byday: [dow] };
    case 'biweekly':
      return { freq: 'weekly', interval: 2, byday: [dow] };
    case 'monthly':
      return { freq: 'monthly', interval: 1 };
    default:
      return null;
  }
}

function presetFromRrule(r: RRule | null, date: Date): string {
  if (!r) return 'none';
  const dow = BYDAY_CODES[date.getDay()];
  if (r.freq === 'daily' && (r.interval || 1) === 1) return 'daily';
  if (r.freq === 'weekly' && (r.interval || 1) === 1 && r.byday && r.byday.length === 5 && ['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => r.byday!.includes(d))) return 'weekdays';
  if (r.freq === 'weekly' && (r.interval || 1) === 1 && r.byday && r.byday.length === 1 && r.byday[0] === dow) return 'weekly';
  if (r.freq === 'weekly' && (r.interval || 1) === 2 && r.byday && r.byday.length === 1 && r.byday[0] === dow) return 'biweekly';
  if (r.freq === 'monthly' && (r.interval || 1) === 1) return 'monthly';
  return 'custom';
}

export const RecurrenceBlock = ({ rrule, setRrule, date }: { rrule: RRule | null; setRrule: (r: RRule | null) => void; date: Date }) => {
  const preset = presetFromRrule(rrule, date);
  const setPreset = (p: string) => {
    if (p === 'custom') {
      setRrule(rrule || { freq: 'weekly', interval: 1, byday: [BYDAY_CODES[date.getDay()]] });
    } else setRrule(rruleFromPreset(p, date));
  };
  const toggleDay = (code: string) => {
    const cur = (rrule && rrule.byday) || [];
    const next = cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code];
    setRrule({ ...(rrule as RRule), byday: next });
  };
  const setUntil = (v: string) => {
    if (!v) {
      if (!rrule) return;
      const { until: _until, ...rest } = rrule;
      void _until;
      setRrule(rest);
      return;
    }
    const [y, m, d] = v.split('-').map(Number);
    setRrule({ ...(rrule as RRule), until: new Date(y, m - 1, d, 23, 59, 59) });
  };

  return (
    <div className="modal-row">
      <label className="modal-label">Repeats</label>
      <div className="recur">
        <div className="recur-presets">
          {RECUR_PRESETS.map((p) => (
            <button key={p.id} className={'cat-chip' + (preset === p.id ? ' is-active' : '')} onClick={() => setPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {rrule && preset === 'custom' && (
          <div className="recur-custom">
            <div className="recur-row">
              <span className="modal-label">Every</span>
              <input
                type="number"
                className="modal-input mono recur-num"
                min={1}
                max={99}
                value={rrule.interval || 1}
                onChange={(e) => setRrule({ ...rrule, interval: Math.max(1, +e.target.value || 1) })}
              />
              <select className="modal-input mono" value={rrule.freq} onChange={(e) => setRrule({ ...rrule, freq: e.target.value as Freq })}>
                <option value="daily">day(s)</option>
                <option value="weekly">week(s)</option>
                <option value="monthly">month(s)</option>
              </select>
            </div>
            {rrule.freq === 'weekly' && (
              <div className="recur-row">
                <span className="modal-label">On</span>
                <div className="recur-dow">
                  {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((code) => {
                    const on = (rrule.byday || []).includes(code);
                    return (
                      <button key={code} className={'dow-pill' + (on ? ' is-on' : '')} onClick={() => toggleDay(code)}>
                        {BYDAY_LABEL[code].slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {rrule && (
          <div className="recur-row">
            <span className="modal-label">Ends</span>
            <input type="date" className="modal-input mono" value={rrule.until ? isoDate(rrule.until) : ''} onChange={(e) => setUntil(e.target.value)} />
            <span className="recur-hint mono">(blank = never)</span>
          </div>
        )}
      </div>
    </div>
  );
};
